const cds = require('@sap/cds')

/**
 * Automatically injects isDeleted and deletedAt fields
 * into entities annotated with @softDelete.enabled when the model is loaded
 */
cds.once('loaded', (csn) => {
    console.log('Soft Delete Plugin: Enhancing model with soft delete fields...')
})