const cds = require('@sap/cds')

const { GET, POST, DELETE, PATCH, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('CatalogDraftService - Soft Delete Tests with Draft', () => {

  it('should soft delete a Book when DELETE is called', async () => {
    const newBookDraft = {
      ID: 888,
      title: 'Test Draft Book for Soft Delete',
      stock: 20
    }

    await POST(`/odata/v4/catalog-draft/Books`, newBookDraft)
    const draftID = 888
    await POST(`/odata/v4/catalog-draft/Books(ID=${draftID},IsActiveEntity=false)/CatalogDraftService.draftActivate`)

    const deleteResponse = await DELETE(`/odata/v4/catalog-draft/Books(ID=888,IsActiveEntity=true)`)
    expect(deleteResponse.status).to.equal(204)
  })

  it('should return soft-deleted record when accessed by key', async () => {
    const newBookDraft = {
      ID: 999,
      title: 'Test Book for Key Access',
      stock: 15
    }

    await POST(`/odata/v4/catalog-draft/Books`, newBookDraft)
    const draftID = 999
    await POST(`/odata/v4/catalog-draft/Books(ID=${draftID},IsActiveEntity=false)/CatalogDraftService.draftActivate`)
    await DELETE(`/odata/v4/catalog-draft/Books(ID=999,IsActiveEntity=true)`)

    const { data: keyAccessGet } = await GET(`/odata/v4/catalog-draft/Books(ID=999,IsActiveEntity=true)`, {
      params: { $select: 'ID,title,isDeleted,IsActiveEntity' }
    })

    expect(keyAccessGet).to.containSubset({
      ID: 999,
      title: 'Test Book for Key Access',
      isDeleted: true,
      IsActiveEntity: true
    })
  })

  it('should NOT return soft-deleted record in list queries without isDeleted filter', async () => {
    const newBookDraft = {
      ID: 777,
      title: 'Test Book for List Query',
      stock: 10
    }

    await POST(`/odata/v4/catalog-draft/Books`, newBookDraft)
    const draftID = 777
    await POST(`/odata/v4/catalog-draft/Books(ID=${draftID},IsActiveEntity=false)/CatalogDraftService.draftActivate`)
    await DELETE(`/odata/v4/catalog-draft/Books(ID=777,IsActiveEntity=true)`)

    const { data: listGet } = await GET(`/odata/v4/catalog-draft/Books?$filter=ID%20eq%20777%20and%20IsActiveEntity%20eq%20true&$select=ID,title,isDeleted,IsActiveEntity`)

    expect(listGet.value).to.have.lengthOf(0)
  })

  it('should return soft-deleted record when filtering with isDeleted=true', async () => {
    const newBookDraft = {
      ID: 666,
      title: 'Test Book for Deleted Filter',
      stock: 12
    }

    await POST(`/odata/v4/catalog-draft/Books`, newBookDraft)
    const draftID = 666
    await POST(`/odata/v4/catalog-draft/Books(ID=${draftID},IsActiveEntity=false)/CatalogDraftService.draftActivate`)
    await DELETE(`/odata/v4/catalog-draft/Books(ID=666,IsActiveEntity=true)`)

    const { data: deletedGet } = await GET(`/odata/v4/catalog-draft/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20666%20and%20IsActiveEntity%20eq%20true&$select=ID,title,isDeleted,IsActiveEntity`)

    expect(deletedGet.value).to.have.lengthOf(1)
    expect(deletedGet.value[0]).to.containSubset({
      ID: 666,
      title: 'Test Book for Deleted Filter',
      isDeleted: true,
      IsActiveEntity: true
    })
  })

})
