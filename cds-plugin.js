const cds = require('@sap/cds')
const {
    LOG,
    hasIsDeletedInWhere,
    getIsDeletedValueFromWhere,
    addIsDeletedFilterToExpands,
    softDeleteCompositionChildren,
    getKeyAccessWhere
} = require('./lib/utils')

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

        // Find all entities with @softdelete.enabled annotation
        const enabledEntities = Object.entries(srv.entities)
            .filter(([_, def]) => def?.['@softdelete.enabled'])

        // Validate that all enabled entities have required fields
        for (const [name, def] of enabledEntities) {
            const missingFields = []
            if (!def?.elements?.isDeleted) missingFields.push('isDeleted')
            if (!def?.elements?.deletedAt) missingFields.push('deletedAt')
            if (!def?.elements?.deletedBy) missingFields.push('deletedBy')

            if (missingFields.length > 0) {
                const error = `Entity '${name}' in service '${srv.name}' has @softdelete.enabled but is missing required fields: ${missingFields.join(', ')}. Please add the 'softdelete' aspect to the entity.`
                LOG.error(error)
                throw new Error(error)
            }
        }

        // Find entities with all required fields
        const targets = enabledEntities
            .filter(([_, def]) =>
                def?.elements?.isDeleted && def?.elements?.deletedAt && def?.elements?.deletedBy
            )
            .map(([name]) => name)

        if (!targets.length) continue
        LOG.info(`Enabling soft delete for entities: ${targets.join(', ')}`)

        srv.prepend(() => {
            // Setup draft DELETE handlers for draft-enabled entities
            for (const targetName of targets) {
                // Check if the target has a drafts entity
                const targetEntity = srv.entities[targetName]
                const hasDrafts = targetEntity?.drafts !== undefined

                if (hasDrafts) {
                    // Get the draft entity definition and name
                    const draftEntity = targetEntity.drafts
                    const draftEntityName = draftEntity.name
                    LOG.info(`Registering DELETE handler for draft entity: ${draftEntityName}`)

                    // Register DELETE handler for draft entities
                    // Use the entity reference directly instead of string name
                    srv.on('DELETE', draftEntity, async (req) => {
                        LOG.info(`Soft deleting draft entity ${draftEntityName}`)

                        // Check if the draft record is already soft deleted (idempotency check)
                        const existingRecord = await SELECT.one.from(req.target).columns('isDeleted').where(req.data)

                        if (existingRecord && existingRecord.isDeleted === true) {
                            LOG.debug('Draft record is already soft deleted, skipping update')
                            return 0
                        }

                        // Set isDeleted=true on the draft entity instead of physical delete
                        // This will be propagated to the active entity when the draft is activated
                        const now = new Date().toISOString()
                        const deletionData = {
                            isDeleted: true,
                            deletedAt: now,
                            deletedBy: req.user?.id || 'system'
                        }

                        // Use the draft entity from the request target to get the correct entity reference
                        await UPDATE(req.target).set(deletionData).where(req.data)

                        // Cascade soft delete to composition children of the draft entity
                        try {
                            await softDeleteCompositionChildren(draftEntity, req.data, deletionData)
                        } catch (error) {
                            LOG.error('Failed to cascade soft delete to composition children:', error)
                            return req.reject(500, 'Failed to cascade soft delete to composition children')
                        }

                        // Return empty result to prevent default physical delete
                        // The isDeleted flag will be propagated to the active entity when the draft is activated
                        return 0
                    })
                }
            }

            // Automatically filter out soft-deleted records on READ for soft-delete enabled entities
            srv.before('READ', targets, async (req) => {
                // Skip filtering for draft entities
                // Draft entities need to see soft-deleted records so they can be activated
                if (req.target?.name?.endsWith('.drafts')) {
                    LOG.debug('Skipping isDeleted filter for draft entity:', req.target.name)
                    return
                }

                // Check if isDeleted is already specified in the query filter
                const whereClause = req.query?.SELECT?.where
                const fromClause = req.query?.SELECT?.from

                // Skip adding isDeleted filter if this is a by-key access to the target entity
                // When accessing by key (e.g., Books(ID=1) or Books(ID=1,IsActiveEntity=true)),
                // the from clause will have a where condition: {ref: [{id: "Entity", where: [...]}]}
                // However, for navigation paths (e.g., Orders(ID=1)/items), the from.ref[0].where
                // refers to the parent entity, not the target. We should only skip filtering if
                // the target entity is being accessed by key directly (not via navigation).
                let isNavigationPath = false
                let parentIsDeletedValue = null

                if (fromClause?.ref?.[0]?.where) {
                    // Check if this is a direct by-key access to the target entity
                    // We need to verify that the entity being accessed (in fromClause) matches the target entity
                    // For navigation paths like Orders(ID=1)/items:
                    //   - req.target.name might be "OrderDraftService.OrderItems"
                    //   - fromClause.ref[0].id might be "OrderDraftService.Orders"
                    //   - The query is accessing items through the Orders navigation
                    //
                    // Strategy: Check if fromClause.ref has multiple elements OR if the entity names differ
                    isNavigationPath = fromClause.ref.length > 1

                    // Additional check: if fromClause.ref[0] has an 'id' property, compare it with target name
                    if (fromClause.ref[0].id) {
                        // Extract entity name without service prefix for comparison
                        const targetEntityName = req.target.name.split('.').pop()
                        const fromEntityName = fromClause.ref[0].id.split('.').pop()

                        // If the entity names are different, this is a navigation path
                        if (targetEntityName !== fromEntityName) {
                            // Navigation path detected
                            isNavigationPath = true

                            // Check if parent entity has soft delete fields
                            const parentEntityFullName = fromClause.ref[0].id
                            const parentEntity = cds.model.definitions[parentEntityFullName]

                            if (parentEntity?.elements?.isDeleted) {
                                // Parent has soft delete, check its isDeleted status
                                try {
                                    const parentKeyWhere = fromClause.ref[0].where
                                    const result = await SELECT.one.from(parentEntity).columns('isDeleted').where(parentKeyWhere)
                                    if (result) {
                                        parentIsDeletedValue = result.isDeleted
                                        LOG.debug(`Navigation path: parent isDeleted = ${parentIsDeletedValue}`)
                                    }
                                } catch (error) {
                                    LOG.debug(`Could not fetch parent isDeleted value: ${error.message}`)
                                }
                            }
                        } else if (!isNavigationPath) {
                            // By-key access to the same entity, skip filtering
                            LOG.debug('By-key access detected, skipping isDeleted filter')
                            return
                        }
                    } else if (!isNavigationPath) {
                        LOG.debug('By-key access detected, skipping isDeleted filter')
                        return
                    }
                }

                if (!hasIsDeletedInWhere(whereClause)) {
                    // Determine which isDeleted value to use
                    // For navigation paths from soft-deleted parents, use parent's isDeleted value
                    // Otherwise, use false to exclude soft-deleted records
                    const isDeletedValue = (isNavigationPath && parentIsDeletedValue !== null) ? parentIsDeletedValue : false

                    // Add isDeleted filter to exclude/include soft-deleted records
                    if (!req.query.SELECT.where) {
                        req.query.SELECT.where = [{ ref: ['isDeleted'] }, '=', { val: isDeletedValue }]
                    } else {
                        // Wrap existing where clause and add AND condition
                        req.query.SELECT.where = [
                            '(', ...req.query.SELECT.where, ')',
                            'and',
                            { ref: ['isDeleted'] }, '=', { val: isDeletedValue }
                        ]
                    }
                    LOG.debug(`Filtering records with isDeleted = ${isDeletedValue}`)
                }
            })

            // Add isDeleted filter to expanded navigations for ALL entities
            // This handles cases where a non-soft-delete entity expands a soft-delete entity
            srv.before('READ', '*', async (req) => {
                // Skip filtering for draft entities
                // Draft entities need to see soft-deleted records so they can be activated
                if (req.target?.name?.endsWith('.drafts')) {
                    LOG.debug('Skipping expand filter for draft entity:', req.target.name)
                    return
                }

                const columns = req.query?.SELECT?.columns
                if (columns) {
                    const entity = req.target
                    const whereClause = req.query?.SELECT?.where
                    const fromClause = req.query?.SELECT?.from

                    // Get the isDeleted filter value from parent query (if specified)
                    let parentIsDeletedValue = getIsDeletedValueFromWhere(whereClause)

                    // For key-based access (Object Page), we need to check the parent's isDeleted status
                    // because the parent's where clause doesn't contain isDeleted filter
                    if (parentIsDeletedValue === null && entity?.elements?.isDeleted) {
                        const keyAccessWhere = getKeyAccessWhere(fromClause)
                        if (keyAccessWhere) {
                            // This is a key-based access, fetch the parent's isDeleted value
                            try {
                                const result = await SELECT.one.from(entity).columns('isDeleted').where(keyAccessWhere)
                                if (result) {
                                    parentIsDeletedValue = result.isDeleted
                                    LOG.debug(`Key-based access: parent isDeleted = ${parentIsDeletedValue}`)
                                }
                            } catch (error) {
                                LOG.debug(`Could not fetch parent isDeleted value: ${error.message}`)
                            }
                        }
                    }

                    addIsDeletedFilterToExpands(columns, entity, targets, parentIsDeletedValue)
                }
            })

            // Intercept DELETE requests and perform soft delete instead of physical delete
            srv.on('DELETE', targets, async(req) => {
                LOG.info(`Soft deleting from ${req.target.name}`)

                // Check if the record is already soft deleted (idempotency check)
                const existingRecord = await SELECT.one.from(req.target).columns('isDeleted').where(req.data)

                if (existingRecord && existingRecord.isDeleted === true) {
                    LOG.debug('Record is already soft deleted, skipping update')
                    return req.reply(204)
                }

                // Set isDeleted=true and deletedAt=timestamp instead of physically deleting
                const now = new Date().toISOString()
                const deletionData = {
                    isDeleted: true,
                    deletedAt: now,
                    deletedBy: req.user?.id || 'system'
                }

                const u = UPDATE(req.target).set(deletionData).where(req.data)

                // Execute the soft delete on the parent entity
                await u

                // Cascade soft delete to composition children
                // req.data contains the key values of the entity being deleted
                try {
                    await softDeleteCompositionChildren(req.target, req.data, deletionData)
                } catch (error) {
                    LOG.error('Failed to cascade soft delete to composition children:', error)
                    return req.reject(500, 'Failed to cascade soft delete to composition children')
                }

                return req.reply(204)
            })

        })
    }

})