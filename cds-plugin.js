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
            srv.before('READ', targets, (req) => {
                // Check if isDeleted is already specified in the query filter
                const whereClause = req.query?.SELECT?.where
                const fromClause = req.query?.SELECT?.from

                // Skip adding isDeleted filter if this is a by-key access
                // When accessing by key (e.g., Books(ID=1) or Books(ID=1,IsActiveEntity=true)),
                // the from clause will have a where condition: {ref: [{id: "Entity", where: [...]}]}
                // This indicates direct key-based access to a specific record
                if (fromClause?.ref?.[0]?.where) {
                    LOG.debug('By-key access detected (from.ref[0].where exists), skipping isDeleted filter')
                    return
                }

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
            srv.before('READ', '*', async (req) => {
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