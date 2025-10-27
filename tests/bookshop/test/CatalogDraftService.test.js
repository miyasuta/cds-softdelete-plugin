const cds = require('@sap/cds')

const { GET, POST, DELETE, PATCH, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('CatalogDraftService - Soft Delete Tests with Draft', () => {

  it('should create draft, activate, delete, and verify soft delete behavior for Books', async () => {
    // Create a new Book draft
    const newBookDraft = {
      ID: 888,
      title: 'Test Draft Book for Soft Delete',
      stock: 20
    }

    const createDraftResponse = await POST(`/odata/v4/catalog-draft/Books`, newBookDraft)
    expect(createDraftResponse.status).to.equal(201)
    expect(createDraftResponse.data).to.containSubset({
      ID: 888,
      title: 'Test Draft Book for Soft Delete',
      IsActiveEntity: false
    })

    // Activate the draft - use the ID from the response
    const draftID = createDraftResponse.data.ID
    const activateResponse = await POST(
      `/odata/v4/catalog-draft/Books(ID=${draftID},IsActiveEntity=false)/CatalogDraftService.draftActivate`
    )
    expect(activateResponse.status).to.equal(201)

    // Delete the active Book
    const deleteResponse = await DELETE(`/odata/v4/catalog-draft/Books(ID=888,IsActiveEntity=true)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify it's NOT returned with normal GET request
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/catalog-draft/Books(ID=888,IsActiveEntity=true)`, {
        params: { $select: 'ID,title' }
      })
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CAN be retrieved when filtering with isDeleted=true
    const { data: deletedGet } = await GET(`/odata/v4/catalog-draft/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20888%20and%20IsActiveEntity%20eq%20true&$select=ID,title,isDeleted,IsActiveEntity`)
    expect(deletedGet.value).to.have.lengthOf(1)
    expect(deletedGet.value[0]).to.containSubset({
      ID: 888,
      title: 'Test Draft Book for Soft Delete',
      isDeleted: true,
      IsActiveEntity: true
    })
  })

})
