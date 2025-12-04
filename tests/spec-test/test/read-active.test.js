const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('Active read test cases', () => {

  describe('READ-A-01: Root list (deleted excluded)', () => {
    it('Without isDeleted specified, only isDeleted=false are returned', async () => {
      const orderID1 = 'A1'
      const orderID2 = 'A2'

      // Prerequisite: A1: isDeleted=false, A2: isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID1,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      await POST(`/odata/v4/order/Orders`, {
        ID: orderID2,
        createdAt: new Date().toISOString(),
        total: 200.00
      })

      // Delete A2
      await DELETE(`/odata/v4/order/Orders('${orderID2}')`)

      // Operation: GET /OrderService/Orders
      const { data } = await GET(`/odata/v4/order/Orders`)

      // Expected result: Only A1 is returned
      const a1 = data.value.find(o => o.ID === orderID1)
      const a2 = data.value.find(o => o.ID === orderID2)

      expect(a1).to.not.be.undefined
      expect(a1.isDeleted).to.be.false
      expect(a2).to.be.undefined
    })
  })

  describe('READ-A-02: Retrieve only deleted (filter)', () => {
    it('$filter=isDeleted eq true is effective', async () => {
      const orderID1 = 'A3'
      const orderID2 = 'A4'

      // Prerequisite: A3: false, A4: true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID1,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      await POST(`/odata/v4/order/Orders`, {
        ID: orderID2,
        createdAt: new Date().toISOString(),
        total: 200.00
      })

      // Delete A4
      await DELETE(`/odata/v4/order/Orders('${orderID2}')`)

      // Operation: GET /OrderService/Orders?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order/Orders?$filter=isDeleted eq true`)

      // Expected result: Only A4 is returned
      const result = data.value.filter(o => [orderID1, orderID2].includes(o.ID))
      expect(result).to.have.lengthOf(1)
      expect(result[0].ID).to.equal(orderID2)
      expect(result[0].isDeleted).to.be.true
    })
  })

  describe('READ-A-03: $filter=isDeleted eq false', () => {
    it('Even with explicit filter, only isDeleted=false are returned', async () => {
      const orderID1 = 'A5'
      const orderID2 = 'A6'

      // Prerequisite
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID1,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      await POST(`/odata/v4/order/Orders`, {
        ID: orderID2,
        createdAt: new Date().toISOString(),
        total: 200.00
      })

      // Delete A6
      await DELETE(`/odata/v4/order/Orders('${orderID2}')`)

      // Operation: GET /OrderService/Orders?$filter=isDeleted eq false
      const { data } = await GET(`/odata/v4/order/Orders?$filter=isDeleted eq false`)

      // Expected result: Only isDeleted=false is returned
      const result = data.value.filter(o => [orderID1, orderID2].includes(o.ID))
      expect(result).to.have.lengthOf(1)
      expect(result[0].ID).to.equal(orderID1)
      expect(result[0].isDeleted).to.be.false
    })
  })

  describe('READ-A-04: By key (non-deleted)', () => {
    it('Key-specified access returns regardless of isDeleted', async () => {
      const orderID = 'A7'

      // Prerequisite: A7: isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Operation: GET /OrderService/Orders('A7')
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')`)

      // Expected result: A7 is returned
      expect(data.ID).to.equal(orderID)
      expect(data.isDeleted).to.be.false
    })
  })

  describe('READ-A-05: By key (deleted)', () => {
    it('Even if deleted, returned via key-specified access', async () => {
      const orderID = 'A8'

      // Prerequisite: A8: isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Delete A8
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Operation: GET /OrderService/Orders('A8')
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')`)

      // Expected result: A8 with isDeleted=true is returned
      expect(data.ID).to.equal(orderID)
      expect(data.isDeleted).to.be.true
    })
  })

  describe('READ-A-06: Non-key-specified determination (pseudo key via filter)', () => {
    it('/Orders?$filter=ID eq \'A1\' follows R1/R2', async () => {
      const orderID1 = 'A9'
      const orderID2 = 'A10'

      // Prerequisite: A9: false, A10: true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID1,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      await POST(`/odata/v4/order/Orders`, {
        ID: orderID2,
        createdAt: new Date().toISOString(),
        total: 200.00
      })

      // Delete A10
      await DELETE(`/odata/v4/order/Orders('${orderID2}')`)

      // Operation: GET /OrderService/Orders?$filter=ID eq 'A9'
      const { data } = await GET(`/odata/v4/order/Orders?$filter=ID eq '${orderID1}'`)

      // Expected result: A9 with isDeleted=false is returned
      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].ID).to.equal(orderID1)
      expect(data.value[0].isDeleted).to.be.false
    })
  })

  describe('READ-A-07: Direct access to children (non-deleted)', () => {
    it('R1 is also applied to child list', async () => {
      const orderID = 'A11'
      const item1ID = 'C71'
      const item2ID = 'C72'

      // Prerequisite: C71: false, C72: true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Delete C72
      await DELETE(`/odata/v4/order/OrderItems('${item2ID}')`)

      // Operation: GET /OrderService/OrderItems
      const { data } = await GET(`/odata/v4/order/OrderItems`)

      // Expected result: Only C71 is returned
      const result = data.value.filter(i => [item1ID, item2ID].includes(i.ID))
      expect(result).to.have.lengthOf(1)
      expect(result[0].ID).to.equal(item1ID)
    })
  })

  describe('READ-A-08: Direct access to children (deleted)', () => {
    it('$filter=isDeleted eq true returns only deleted', async () => {
      const orderID = 'A12'
      const item1ID = 'C73'
      const item2ID = 'C74'

      // Prerequisite
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Delete C74
      await DELETE(`/odata/v4/order/OrderItems('${item2ID}')`)

      // Operation: GET /OrderService/OrderItems?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted eq true`)

      // Expected result: Only C74 is returned
      const result = data.value.filter(i => [item1ID, item2ID].includes(i.ID))
      expect(result).to.have.lengthOf(1)
      expect(result[0].ID).to.equal(item2ID)
    })
  })

  describe('READ-A-09: Child by key (deleted)', () => {
    it('Child also returns deleted via key-specified access', async () => {
      const orderID = 'A13'
      const itemID = 'C9'

      // Prerequisite: C9: isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Delete C9
      await DELETE(`/odata/v4/order/OrderItems('${itemID}')`)

      // Operation: GET /OrderService/OrderItems('C9')
      const { data } = await GET(`/odata/v4/order/OrderItems('${itemID}')`)

      // Expected result: C9 is returned
      expect(data.ID).to.equal(itemID)
      expect(data.isDeleted).to.be.true
    })
  })

  describe('READ-A-10: Non-deleted parent + $expand (deleted children excluded)', () => {
    it('R1 is applied in $expand of non-deleted parent', async () => {
      const orderID = 'N10'
      const item1ID = 'N101'
      const item2ID = 'N102'

      // Prerequisite: Parent N10: isDeleted=false, Child N101: false, Child N102: true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Delete N102
      await DELETE(`/odata/v4/order/OrderItems('${item2ID}')`)

      // Operation: GET /OrderService/Orders('N10')?$expand=items
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')?$expand=items`)

      // Expected result: items includes only N101
      expect(data.items).to.have.lengthOf(1)
      expect(data.items[0].ID).to.equal(item1ID)
    })
  })

  describe('READ-A-11: Non-deleted parent + Navigation + isDeleted=true', () => {
    it('Navigation + filter applies R2 and returns only deleted', async () => {
      const orderID = 'N11'
      const item1ID = 'N111'
      const item2ID = 'N112'

      // Prerequisite
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Delete N112
      await DELETE(`/odata/v4/order/OrderItems('${item2ID}')`)

      // Operation: /Orders('N11')/items?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')/items?$filter=isDeleted eq true`)

      // Expected result: Only N112 is returned
      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].ID).to.equal(item2ID)
    })
  })

  describe('READ-A-12: Deleted parent + $expand (returns deleted children)', () => {
    it('When parent is deleted, R4 returns deleted children', async () => {
      const orderID = 'N12'
      const itemID = 'N121'

      // Prerequisite: Parent N12: isDeleted=true, Child N121: isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Delete parent (cascades to delete children)
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Operation: /Orders('N12')?$expand=items
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')?$expand=items`)

      // Expected result: items includes N121
      expect(data.isDeleted).to.be.true
      expect(data.items).to.have.lengthOf(1)
      expect(data.items[0].ID).to.equal(itemID)
      expect(data.items[0].isDeleted).to.be.true
    })
  })

  describe('READ-A-13: Deleted parent + Navigation + isDeleted=false (no hits)', () => {
    it('No non-deleted children exist due to cascade deletion', async () => {
      const orderID = 'N13'
      const itemID = 'N131'

      // Prerequisite
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Delete parent
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Operation: /Orders('N13')/items?$filter=isDeleted eq false
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')/items?$filter=isDeleted eq false`)

      // Expected result: Empty array
      expect(data.value).to.have.lengthOf(0)
    })
  })

  describe('READ-A-14: Deep hierarchy $expand (deleted parent)', () => {
    it('When parent is deleted, expanding deep hierarchy via $expand returns all levels as deleted', async () => {
      const orderID = 'N14'
      const itemID = 'N141'
      const detailID = 'N1411'

      // Prerequisite: Orders('N14'): isDeleted=true, OrderItems('N141'): isDeleted=true, ItemDetails('N1411'): isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          {
            ID: itemID,
            quantity: 5,
            details: [
              { ID: detailID, text: 'Detail 1' }
            ]
          }
        ]
      })

      // Delete parent
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Operation: GET /OrderService/Orders('N14')?$expand=items($expand=details)
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')?$expand=items($expand=details)`)

      // Expected result: items includes N141, items[0].details includes N1411, all have isDeleted=true
      expect(data.isDeleted).to.be.true
      expect(data.items).to.have.lengthOf(1)
      expect(data.items[0].ID).to.equal(itemID)
      expect(data.items[0].isDeleted).to.be.true
      expect(data.items[0].details).to.have.lengthOf(1)
      expect(data.items[0].details[0].ID).to.equal(detailID)
      expect(data.items[0].details[0].isDeleted).to.be.true
    })
  })

  describe('READ-A-15: Composite key specification (all keys specified)', () => {
    it('When all composite keys are specified, R3 is applied and returns regardless of isDeleted', async () => {
      const bookID = 1
      const bookVersion = 2

      // Prerequisite: Books(ID=1,version=2): isDeleted=true
      await POST(`/odata/v4/book/Books`, {
        ID: bookID,
        version: bookVersion,
        title: 'Test Book'
      })

      // Delete
      await DELETE(`/odata/v4/book/Books(ID=${bookID},version=${bookVersion})`)

      // Operation: GET /BookService/Books(ID=1,version=2)
      const { data } = await GET(`/odata/v4/book/Books(ID=${bookID},version=${bookVersion})`)

      // Expected result: Books(ID=1,version=2) is returned (even with isDeleted=true)
      expect(data.ID).to.equal(bookID)
      expect(data.version).to.equal(bookVersion)
      expect(data.isDeleted).to.be.true
    })
  })

  describe('READ-A-16: Partial composite key specification (not treated as key specification)', () => {
    it('When only part of composite key is specified, R1 is applied and only isDeleted=false are returned', async () => {
      const bookID = 2
      const bookVersion1 = 1
      const bookVersion2 = 2

      // Prerequisite: Books(ID=2,version=1): isDeleted=false, Books(ID=2,version=2): isDeleted=true
      await POST(`/odata/v4/book/Books`, {
        ID: bookID,
        version: bookVersion1,
        title: 'Test Book v1'
      })

      await POST(`/odata/v4/book/Books`, {
        ID: bookID,
        version: bookVersion2,
        title: 'Test Book v2'
      })

      // Delete version=2
      await DELETE(`/odata/v4/book/Books(ID=${bookID},version=${bookVersion2})`)

      // Operation: GET /BookService/Books?$filter=ID eq 2
      const { data } = await GET(`/odata/v4/book/Books?$filter=ID eq ${bookID}`)

      // Expected result: Only Books(ID=2,version=1) is returned (only isDeleted=false)
      const result = data.value.filter(b => b.ID === bookID)
      expect(result).to.have.lengthOf(1)
      expect(result[0].version).to.equal(bookVersion1)
      expect(result[0].isDeleted).to.be.false
    })
  })

})
