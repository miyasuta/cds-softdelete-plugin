const cds = require('@sap/cds')

const { GET, POST, DELETE, PATCH, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

// ヘルパー関数: Draft Book作成
async function createDraftBook(bookID, title = 'Test Book', stock = 10) {
  await POST(`/odata/v4/catalog-draft/Books`, { ID: bookID, title, stock })
}

// ヘルパー関数: Draft Book作成 + アクティベート
async function createAndActivateBook(bookID, title = 'Test Book', stock = 10) {
  await createDraftBook(bookID, title, stock)
  await POST(`/odata/v4/catalog-draft/Books(ID=${bookID},IsActiveEntity=false)/CatalogDraftService.draftActivate`)
}

// ヘルパー関数: Draft Book作成 + アクティベート + 削除
async function createActivateAndDeleteBook(bookID, title = 'Test Book', stock = 10) {
  await createAndActivateBook(bookID, title, stock)
  await DELETE(`/odata/v4/catalog-draft/Books(ID=${bookID},IsActiveEntity=true)`)
}

describe('CatalogDraftService - Draft-Enabled Soft Delete Tests', () => {

  describe('By-key access behavior', () => {

    it('should return soft-deleted active entity when accessed by key', async () => {
      const bookID = 999
      await createActivateAndDeleteBook(bookID, 'Test Book for Key Access', 15)

      const { data } = await GET(`/odata/v4/catalog-draft/Books(ID=${bookID},IsActiveEntity=true)`, {
        params: { $select: 'ID,title,isDeleted,IsActiveEntity' }
      })

      expect(data).to.containSubset({
        ID: bookID,
        title: 'Test Book for Key Access',
        isDeleted: true,
        IsActiveEntity: true
      })
    })
  })

  describe('List query behavior', () => {

    it('should exclude soft-deleted active entities from list queries', async () => {
      const bookID = 777
      await createActivateAndDeleteBook(bookID, 'Test Book for List Query', 10)

      const { data } = await GET(`/odata/v4/catalog-draft/Books?$filter=ID%20eq%20${bookID}%20and%20IsActiveEntity%20eq%20true&$select=ID,title,isDeleted,IsActiveEntity`)

      expect(data.value).to.have.lengthOf(0)
    })
  })

  describe('Explicit isDeleted filter behavior', () => {

    it('should return soft-deleted active entities when isDeleted=true is specified', async () => {
      const bookID = 666
      await createActivateAndDeleteBook(bookID, 'Test Book for Deleted Filter', 12)

      const { data } = await GET(`/odata/v4/catalog-draft/Books?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${bookID}%20and%20IsActiveEntity%20eq%20true&$select=ID,title,isDeleted,IsActiveEntity`)

      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0]).to.containSubset({
        ID: bookID,
        title: 'Test Book for Deleted Filter',
        isDeleted: true,
        IsActiveEntity: true
      })
    })
  })

})
