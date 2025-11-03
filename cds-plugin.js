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
 * Recursively soft deletes composition children of an entity
 * @param {Object} entity - Entity definition
 * @param {Object} keys - Key values of the parent entity being deleted
 * @param {Object} deletionData - Deletion metadata (deletedAt, deletedBy)
 */
async function softDeleteCompositionChildren(entity, keys, deletionData) {
    if (!entity?.elements) return

    // Find all composition elements in this entity
    for (const [elementName, element] of Object.entries(entity.elements)) {
        // Check if this element is a composition
        if (element.type !== 'cds.Composition') continue

        const targetEntityName = element.target
        if (!targetEntityName) continue

        const targetEntity = cds.model.definitions[targetEntityName]
        if (!targetEntity?.elements?.isDeleted || !targetEntity?.elements?.deletedAt) {
            // Target entity doesn't have soft delete fields, skip
            continue
        }

        LOG.debug(`Cascading soft delete to composition child: ${targetEntityName}`)

        // Build WHERE clause based on parent keys
        // For composition "on items.order = $self", the foreign key naming follows CAP conventions:
        // - If the composition has an explicit "on" clause, parse it to find the association name
        // - The foreign key is typically: <association_name>_<parent_key_name>

        // Find the association name from the "on" condition
        // e.g., "items.order = $self" -> the ref in the condition is ['items', 'order'] or ['order']
        // We want 'order' (the last element before '=' which is not '$self')
        let associationName = null
        if (element.on && Array.isArray(element.on)) {
            // Parse the "on" condition to find the association reference
            // The "on" clause can look like:
            // - [{ ref: ['items', 'order'] }, '=', { ref: ['$self'] }]
            // - [{ ref: ['order'] }, '=', { ref: ['$self'] }]
            for (const part of element.on) {
                if (part.ref && Array.isArray(part.ref)) {
                    // Skip $self reference, we want the actual association name
                    if (part.ref[0] !== '$self') {
                        // If ref has multiple parts (e.g., ['items', 'order']), take the last one
                        // Otherwise, take the first (and only) one
                        associationName = part.ref.length > 1 ? part.ref[part.ref.length - 1] : part.ref[0]
                        break
                    }
                }
            }
        }

        if (!associationName) {
            LOG.warn(`Could not determine association name for composition ${elementName} -> ${targetEntityName}`)
            continue
        }

        LOG.debug(`Association name found: ${associationName} for composition ${elementName}`)

        let whereConditions = []
        const keyEntries = Object.entries(keys)
        for (let i = 0; i < keyEntries.length; i++) {
            const [keyName, keyValue] = keyEntries[i]
            // Build foreign key name: <association_name>_<parent_key_name>
            const childFKName = `${associationName}_${keyName}`
            LOG.debug(`Building WHERE condition: ${childFKName} = ${keyValue}`)
            whereConditions.push({ ref: [childFKName] }, '=', { val: keyValue })
            if (i < keyEntries.length - 1) {
                whereConditions.push('and')
            }
        }

        if (whereConditions.length === 0) continue

        try {
            // Soft delete child records
            await UPDATE(targetEntityName)
                .set(deletionData)
                .where(whereConditions)

            // Recursively soft delete nested compositions
            await softDeleteCompositionChildren(targetEntity, keys, deletionData)
        } catch (error) {
            LOG.error(`Failed to cascade soft delete to ${targetEntityName}:`, error)
            throw error
        }
    }
}

/**
 * Extracts the isDeleted filter value from a WHERE clause
 * @param {Array} where - CQN where clause array
 * @returns {boolean|null} - The isDeleted value if found, null otherwise
 */
function getIsDeletedValueFromWhere(where) {
    if (!where || !Array.isArray(where)) return null

    for (let i = 0; i < where.length; i++) {
        const element = where[i]

        // Check for pattern: { ref: ['isDeleted'] }, '=', { val: true/false }
        if (element?.ref) {
            const ref = Array.isArray(element.ref) ? element.ref : [element.ref]
            if (ref[0] === 'isDeleted' || ref.some(r => r === 'isDeleted')) {
                // Look ahead for the value
                if (i + 2 < where.length && where[i + 1] === '=' && where[i + 2]?.val !== undefined) {
                    return where[i + 2].val
                }
            }
        }

        // Recursively check nested arrays
        if (Array.isArray(element)) {
            const result = getIsDeletedValueFromWhere(element)
            if (result !== null) return result
        }

        // Check xpr (expression) elements
        if (element?.xpr) {
            const result = getIsDeletedValueFromWhere(element.xpr)
            if (result !== null) return result
        }
    }

    return null
}

/**
 * Recursively adds isDeleted filter to all expanded columns that target soft-delete enabled entities
 * @param {Array} columns - CQN columns array
 * @param {Object} entity - Current entity definition
 * @param {Array} softDeleteTargets - List of soft-delete enabled entity names
 * @param {boolean|null} parentIsDeletedValue - The isDeleted filter value from the parent query (null if not specified)
 */
function addIsDeletedFilterToExpands(columns, entity, softDeleteTargets, parentIsDeletedValue = null) {
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
            const targetEntity = cds.model.definitions[targetEntityName]

            // Check if target entity has soft delete fields
            const hasSoftDeleteFields = targetEntity?.elements?.isDeleted && targetEntity?.elements?.deletedAt

            // Check if target entity is soft-delete enabled with @softdelete.enabled
            const shortName = targetEntityName?.split('.').pop()
            const isSoftDeleteEnabled = targetEntityName && (
                softDeleteTargets.includes(targetEntityName) ||
                softDeleteTargets.includes(shortName)
            )

            // Check if this is a composition relationship
            // Composition: parent owns children (e.g., Order -> OrderItems)
            // Association: independent relationship (e.g., Book -> Author)
            const isComposition = element.type === 'cds.Composition'

            // Determine if we should add/propagate isDeleted filter
            // Filter is added if:
            // 1. Target has soft delete fields (isDeleted, deletedAt), AND
            // 2. Target is soft-delete enabled OR is a composition child
            const shouldAddFilter = hasSoftDeleteFields && (isSoftDeleteEnabled || isComposition)

            if (shouldAddFilter) {
                // Determine which isDeleted value to use
                let isDeletedValue = false // default

                if (isComposition && parentIsDeletedValue !== null) {
                    // For compositions: propagate parent's isDeleted filter value
                    // Example: If parent has isDeleted=true, children also get isDeleted=true filter
                    // This ensures deleted orders only show deleted items in $expand
                    isDeletedValue = parentIsDeletedValue
                } else if (isSoftDeleteEnabled) {
                    // For soft-delete enabled entities: use false by default
                    // This filters out soft-deleted records unless explicitly requested
                    isDeletedValue = false
                }

                // Add infix where clause to the expanded column
                if (!col.where) {
                    // No existing filter: add isDeleted filter
                    col.where = [{ ref: ['isDeleted'] }, '=', { val: isDeletedValue }]
                } else if (!hasIsDeletedInWhere(col.where)) {
                    // Existing filter without isDeleted: combine with AND
                    // Example: $expand=items($filter=quantity gt 5) becomes
                    //          $expand=items($filter=(quantity gt 5) AND isDeleted=false)
                    col.where = [
                        '(', ...col.where, ')',
                        'and',
                        { ref: ['isDeleted'] }, '=', { val: isDeletedValue }
                    ]
                }
                // If isDeleted is already in the filter, respect user's explicit filter
                // Example: $expand=items($filter=isDeleted eq true) is not modified
            }

            // Recursively process nested expands
            // Pass down the current isDeletedValue for compositions
            if (Array.isArray(col.expand) && targetEntity) {
                const childIsDeletedValue = isComposition && col.where
                    ? getIsDeletedValueFromWhere(col.where)
                    : parentIsDeletedValue
                addIsDeletedFilterToExpands(col.expand, targetEntity, softDeleteTargets, childIsDeletedValue)
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
                    const whereClause = req.query?.SELECT?.where
                    // Get the isDeleted filter value from parent query (if specified)
                    const parentIsDeletedValue = getIsDeletedValueFromWhere(whereClause)
                    addIsDeletedFilterToExpands(columns, entity, targets, parentIsDeletedValue)
                }
            })

            // Intercept DELETE requests and perform soft delete instead of physical delete
            srv.on('DELETE', targets, async(req) => {
                LOG.info(`Soft deleting from ${req.target.name}`)

                // Set isDeleted=true and deletedAt=timestamp instead of physically deleting
                const now = new Date().toISOString()
                const deletionData = {
                    isDeleted: true,
                    deletedAt: now,
                    deletedBy: req.user.id
                }

                const u = UPDATE(req.target).set(deletionData)

                if (req.query?.DELETE?.where) {
                    u.where(req.query.DELETE.where)
                } else if (req.data && Object.keys(req.data).length) {
                    u.where(req.data)
                } else {
                    return req.reject(400, 'No target specified for DELETE')
                }

                // Execute the soft delete on the parent entity
                await u

                // Cascade soft delete to composition children
                // req.data contains the key values of the entity being deleted
                if (req.data && Object.keys(req.data).length > 0) {
                    try {
                        await softDeleteCompositionChildren(req.target, req.data, deletionData)
                    } catch (error) {
                        LOG.error('Failed to cascade soft delete to composition children:', error)
                        return req.reject(500, 'Failed to cascade soft delete to composition children')
                    }
                }

                return req.reply(204)
            })

        })
    }
    
})