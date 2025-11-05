const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('CatalogService - Soft Delete Tests', () => {

  it('should create, delete, and verify soft delete behavior for Books', async () => {
    // Create a new Book
    const newBook = {
      ID: 999,
      title: 'Test Book for Soft Delete',
      stock: 10
    }

    const createResponse = await POST(`/odata/v4/catalog/Books`, newBook)
    expect(createResponse.status).to.equal(201)
    expect(createResponse.data).to.containSubset({ ID: 999, title: 'Test Book for Soft Delete' })

    // Delete the Book
    const deleteResponse = await DELETE(`/odata/v4/catalog/Books(999)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify it's NOT returned with normal GET request
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/catalog/Books(999)`, {
        params: { $select: 'ID,title' }
      })
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CAN be retrieved when filtering with isDeleted=true
    const { data: deletedGet } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20999&$select=ID,title,isDeleted,deletedAt,deletedBy`)
    expect(deletedGet.value).to.have.lengthOf(1)

    const deletedBook = deletedGet.value[0]
    expect(deletedBook).to.containSubset({
      ID: 999,
      title: 'Test Book for Soft Delete',
      isDeleted: true
    })

    // Verify deletedAt is set and is a valid timestamp
    expect(deletedBook.deletedAt).to.exist
    expect(deletedBook.deletedAt).to.be.a('string')

    // Verify deletedBy is set and is the authenticated user
    expect(deletedBook.deletedBy).to.exist
    expect(deletedBook.deletedBy).to.equal('alice')

    // Verify deletedAt is a recent timestamp (within last minute)
    const deletedAtTime = new Date(deletedBook.deletedAt).getTime()
    const now = Date.now()
    expect(deletedAtTime).to.be.greaterThan(now - 60000) // Within last 60 seconds
    expect(deletedAtTime).to.be.lessThanOrEqual(now)
  })

  it('should handle requests without user.id and use fallback value', async () => {
    // This test verifies that when req.user.id is not available,
    // the plugin uses a fallback value (could be 'system' or CAP's default like 'anonymous')

    // Create a new Book
    const newBook = {
      ID: 888,
      title: 'Test Book for System Delete',
      stock: 5
    }

    await POST(`/odata/v4/catalog/Books`, newBook)

    // Directly call the service to simulate an internal/system request
    const srv = await cds.connect.to('CatalogService')

    // Create a request without explicit user.id (CAP will use 'anonymous' or similar)
    await srv.delete('Books').where({ ID: 888 })

    // Verify the book is soft deleted with a non-null deletedBy value
    const { data: deletedGet } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20888&$select=ID,title,isDeleted,deletedBy`)
    expect(deletedGet.value).to.have.lengthOf(1)

    const deletedBook = deletedGet.value[0]
    expect(deletedBook.isDeleted).to.be.true
    // Verify deletedBy is set (not null/undefined), could be 'system' or 'anonymous'
    expect(deletedBook.deletedBy).to.exist
    expect(deletedBook.deletedBy).to.be.a('string')
    expect(deletedBook.deletedBy.length).to.be.greaterThan(0)
  })

})
