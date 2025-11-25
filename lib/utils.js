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
 * Checks if all entity keys are specified in the WHERE clause
 * @param {Object} entity - Entity definition
 * @param {Array} where - CQN where clause array
 * @returns {boolean} - true if all keys are specified
 */
function hasAllKeysInWhere(entity, where) {
    if (!entity?.keys || !where || !Array.isArray(where)) return false

    const keyNames = Object.keys(entity.keys)
    if (keyNames.length === 0) return false

    // Extract all referenced field names from the WHERE clause
    const referencedFields = new Set()

    function extractRefs(whereClause) {
        if (!Array.isArray(whereClause)) return

        for (const element of whereClause) {
            if (element?.ref) {
                const ref = Array.isArray(element.ref) ? element.ref : [element.ref]
                referencedFields.add(ref[0])
            }

            // Recursively check nested arrays
            if (Array.isArray(element)) {
                extractRefs(element)
            }

            // Check xpr (expression) elements
            if (element?.xpr) {
                extractRefs(element.xpr)
            }
        }
    }

    extractRefs(where)

    // Check if all key fields are present in the WHERE clause
    return keyNames.every(keyName => referencedFields.has(keyName))
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
            const hasSoftDeleteFields = targetEntity?.elements?.isDeleted && targetEntity?.elements?.deletedAt && targetEntity?.elements?.deletedBy

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
        if (!targetEntity?.elements?.isDeleted || !targetEntity?.elements?.deletedAt || !targetEntity?.elements?.deletedBy) {
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

        // Draft virtual keys that should not be used as foreign keys
        // These are automatically managed by CAP's draft infrastructure
        const draftVirtualKeys = ['IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity']

        // Filter keys to only include keys that belong to the parent entity
        // When deleting via navigation (e.g., Orders(...)/items(...)), req.data may contain
        // keys from both the parent and the child entity. We only want the parent's keys.
        const parentKeys = Object.keys(entity.keys || {}).filter(k => !draftVirtualKeys.includes(k))
        const keyEntries = Object.entries(keys)
            .filter(([keyName]) => !draftVirtualKeys.includes(keyName) && parentKeys.includes(keyName))

        let whereConditions = []
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
            // First, query the child records to get their keys (needed for recursive cascade)
            // We need to do this BEFORE updating them, so we know which records to cascade from
            const childRecords = await SELECT.from(targetEntityName).where(whereConditions)

            // Soft delete child records
            await UPDATE(targetEntityName)
                .set(deletionData)
                .where(whereConditions)

            // Recursively soft delete nested compositions for each child record
            // CRITICAL: We must pass each child's keys, not the parent's keys
            for (const childRecord of childRecords) {
                // Extract the keys from the child record
                // Exclude draft virtual keys as they are managed by CAP's draft infrastructure
                const childKeys = {}
                for (const keyName of Object.keys(targetEntity.keys || {})) {
                    if (!draftVirtualKeys.includes(keyName)) {
                        childKeys[keyName] = childRecord[keyName]
                    }
                }

                if (Object.keys(childKeys).length > 0) {
                    await softDeleteCompositionChildren(targetEntity, childKeys, deletionData)
                }
            }
        } catch (error) {
            LOG.error(`Failed to cascade soft delete to ${targetEntityName}:`, error)
            throw error
        }
    }
}

/**
 * Checks if the request is a key-based access and returns the key conditions
 * @param {Object} fromClause - CQN from clause
 * @returns {Array|null} - The where clause from from.ref[0].where if it's key-based access, null otherwise
 */
function getKeyAccessWhere(fromClause) {
    if (fromClause?.ref?.[0]?.where) {
        return fromClause.ref[0].where
    }
    return null
}

module.exports = {
    LOG,
    hasIsDeletedInWhere,
    hasAllKeysInWhere,
    getIsDeletedValueFromWhere,
    addIsDeletedFilterToExpands,
    softDeleteCompositionChildren,
    getKeyAccessWhere
}
