const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

// ヘルパー関数: Book作成
async function createBook(bookID, title = 'Test Book', stock = 10) {
  return await POST(`/odata/v4/catalog/Books`, { ID: bookID, title, stock })
}

// ヘルパー関数: Book作成 + 削除
async function createAndDeleteBook(bookID, title = 'Test Book', stock = 10) {
  await createBook(bookID, title, stock)
  await DELETE(`/odata/v4/catalog/Books(${bookID})`)
}

describe('CatalogService - Basic Soft Delete Tests', () => {

  describe('Soft delete operation', () => {

    it('should exclude soft-deleted record from list queries without filter', async () => {
      const bookID = 9991
      await createAndDeleteBook(bookID, 'Test Book 1')

      const { data } = await GET(`/odata/v4/catalog/Books`)
      const deletedBook = data.value.find(b => b.ID === bookID)
      expect(deletedBook).to.be.undefined
    })

    it('should exclude soft-deleted record from list queries with $filter by key', async () => {
      const bookID = 9992
      await createAndDeleteBook(bookID, 'Test Book 2')

      const { data } = await GET(`/odata/v4/catalog/Books?$filter=ID%20eq%20${bookID}`)
      expect(data.value).to.have.lengthOf(0)
    })

    it('should return soft-deleted record when filtering with isDeleted=true', async () => {
      const bookID = 9993
      await createAndDeleteBook(bookID, 'Test Book 3')

      const { data } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${bookID}&$select=ID,title,isDeleted,deletedAt,deletedBy`)

      expect(data.value).to.have.lengthOf(1)
      const deletedBook = data.value[0]
      expect(deletedBook).to.containSubset({
        ID: bookID,
        title: 'Test Book 3',
        isDeleted: true
      })
    })

    it('should set deletedAt timestamp correctly', async () => {
      const bookID = 9994
      await createAndDeleteBook(bookID, 'Test Book 4')

      const { data } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${bookID}&$select=deletedAt`)

      const deletedBook = data.value[0]
      expect(deletedBook.deletedAt).to.exist
      expect(deletedBook.deletedAt).to.be.a('string')

      // Verify it's a recent timestamp (within last minute)
      const deletedAtTime = new Date(deletedBook.deletedAt).getTime()
      const now = Date.now()
      expect(deletedAtTime).to.be.greaterThan(now - 60000)
      expect(deletedAtTime).to.be.lessThanOrEqual(now)
    })

    it('should set deletedBy to the authenticated user', async () => {
      const bookID = 9995
      await createAndDeleteBook(bookID, 'Test Book 5')

      const { data } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${bookID}&$select=deletedBy`)

      const deletedBook = data.value[0]
      expect(deletedBook.deletedBy).to.equal('alice')
    })
  })

  describe('Fallback behavior for deletedBy', () => {

    it('should use fallback value when user.id is not available', async () => {
      const bookID = 888
      await createBook(bookID, 'Test Book for System Delete', 5)

      // Directly call the service to simulate an internal/system request
      const srv = await cds.connect.to('CatalogService')
      await srv.delete('Books').where({ ID: bookID })

      const { data } = await GET(`/odata/v4/catalog/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${bookID}&$select=ID,isDeleted,deletedBy`)

      expect(data.value).to.have.lengthOf(1)
      const deletedBook = data.value[0]
      expect(deletedBook.isDeleted).to.be.true
      expect(deletedBook.deletedBy).to.exist
      expect(deletedBook.deletedBy).to.be.a('string')
      expect(deletedBook.deletedBy.length).to.be.greaterThan(0)
    })
  })

})
