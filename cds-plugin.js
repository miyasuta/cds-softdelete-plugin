const cds = require('@sap/cds')

// Initialize logger
const LOG = cds.log('soft-delete')

/**
 * Recursively checks if 'isDeleted' field is referenced in a CQN where clause
 * @param {Array} where - CQN where clause array
 * @returns {boolean} - true if isDeleted is found
 */
function hasIsDeletedInWhere(where) {
    if (!where || !Array.isArray(where)) return false

    for (let i = 0; i < where.length; i++) {
        const element = where[i]

        // Check ref elements (e.g., { ref: ['isDeleted'] })
        if (element?.ref) {
            const ref = Array.isArray(element.ref) ? element.ref : [element.ref]
            if (ref[0] === 'isDeleted' || ref.some(r => r === 'isDeleted')) {
                return true
            }
        }

        // Recursively check nested arrays
        if (Array.isArray(element) && hasIsDeletedInWhere(element)) {
            return true
        }

        // Check xpr (expression) elements
        if (element?.xpr && hasIsDeletedInWhere(element.xpr)) {
            return true
        }
    }

    return false
}

/**
 * Recursively adds isDeleted filter to all expanded columns that target soft-delete enabled entities
 * @param {Array} columns - CQN columns array
 * @param {Object} entity - Current entity definition
 * @param {Array} softDeleteTargets - List of soft-delete enabled entity names
 */
function addIsDeletedFilterToExpands(columns, entity, softDeleteTargets) {
    if (!columns || !Array.isArray(columns)) return

    for (let col of columns) {
        // Skip non-object columns (like '*' or simple strings)
        if (typeof col !== 'object' || !col.ref) continue

        // If this column has an expand property
        if (col.expand) {
            // Get the association/composition target entity name
            const refName = Array.isArray(col.ref) ? col.ref[0] : col.ref
            const element = entity?.elements?.[refName]

            if (!element) continue

            // Get target entity name from association/composition
            const targetEntityName = element.target

            // Check if target entity is soft-delete enabled
            // Support both short name (e.g., "OrderItems") and full name (e.g., "OrderService.OrderItems")
            const shortName = targetEntityName?.split('.').pop()
            const isSoftDeleteEnabled = targetEntityName && (
                softDeleteTargets.includes(targetEntityName) ||
                softDeleteTargets.includes(shortName)
            )

            if (isSoftDeleteEnabled) {
                // Add infix where clause to the expanded column
                if (!col.where) {
                    col.where = [{ ref: ['isDeleted'] }, '=', { val: false }]
                } else if (!hasIsDeletedInWhere(col.where)) {
                    // Combine with existing where clause if isDeleted not already specified
                    col.where = [
                        '(', ...col.where, ')',
                        'and',
                        { ref: ['isDeleted'] }, '=', { val: false }
                    ]
                }
            }

            // Recursively process nested expands
            if (Array.isArray(col.expand) && element && targetEntityName) {
                const targetEntity = cds.model.definitions[targetEntityName]
                if (targetEntity) {
                    addIsDeletedFilterToExpands(col.expand, targetEntity, softDeleteTargets)
                }
            }
        }
    }
}

/**
 * Soft Delete Plugin for CDS Services
 *
 * This plugin provides soft delete functionality for entities annotated with @softdelete.enabled
 *
 * Features:
 * - Intercepts DELETE requests and marks records as deleted (isDeleted=true, deletedAt=timestamp)
 * - Automatically filters out soft-deleted records on READ operations
 * - Allows explicit querying of deleted records by including isDeleted in the filter
 */
cds.once('loaded', () => {
    LOG.info('Soft Delete Plugin: ready')
})

cds.once('served', () => {
    for (const srv of Object.values(cds.services)) {
        if (!srv?.entities) continue

        // Find all entities with @softdelete.enabled annotation and required fields
        const targets = Object.entries(srv.entities)
            .filter(([_, def]) => 
                def?.['@softdelete.enabled'] &&
                def?.elements?.isDeleted && def?.elements?.deletedAt 
            )
            .map(([name]) => name)

        if (!targets.length) continue
        LOG.info(`Enabling soft delete for entities: ${targets.join(', ')}`)

        srv.prepend(() => {
            // Automatically filter out soft-deleted records on READ for soft-delete enabled entities
            srv.before('READ', targets, (req) => {
                // Check if isDeleted is already specified in the query filter
                const whereClause = req.query?.SELECT?.where

                if (!hasIsDeletedInWhere(whereClause)) {
                    // Add isDeleted = false to the filter to exclude soft-deleted records
                    if (!req.query.SELECT.where) {
                        req.query.SELECT.where = [{ ref: ['isDeleted'] }, '=', { val: false }]
                    } else {
                        // Wrap existing where clause and add AND condition
                        req.query.SELECT.where = [
                            '(', ...req.query.SELECT.where, ')',
                            'and',
                            { ref: ['isDeleted'] }, '=', { val: false }
                        ]
                    }
                    LOG.debug('Filtering out soft deleted records')
                }
            })

            // Add isDeleted filter to expanded navigations for ALL entities
            // This handles cases where a non-soft-delete entity expands a soft-delete entity
            srv.before('READ', '*', (req) => {
                const columns = req.query?.SELECT?.columns
                if (columns) {
                    const entity = req.target
                    addIsDeletedFilterToExpands(columns, entity, targets)
                }
            })

            // Intercept DELETE requests and perform soft delete instead of physical delete
            srv.on('DELETE', targets, async(req) => {
                LOG.info(`Soft deleting from ${req.target.name}`)

                // Set isDeleted=true and deletedAt=timestamp instead of physically deleting
                const now = new Date().toISOString()
                const u = UPDATE (req.target).set({ isDeleted: true, deletedAt: now, deletedBy: req.user.id }).where(req.data)

                if (req.query?.DELETE?.where) {
                    u.where(req.query.DELETE.where)
                } else if (req.data && Object.keys(req.data).length) {
                    u.where(req.data)
                } else {
                    return req.reject(400, 'No target specified for DELETE')
                }

                await u
                return req.reply(204)
            })

        })
    }
    
})