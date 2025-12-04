const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('Draft read test cases', () => {

  describe('READ-D-01: Draft root list (non-deleted only)', () => {
    it('By R1, only drafts with isDeleted=false are returned', async () => {
      const orderID = 'D1'

      // Prerequisite: D1: isDeleted=false
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Operation: GET /OrderService/Orders_draft?$filter=IsActiveEntity eq false
      const { data } = await GET(`/odata/v4/order-draft/Orders?$filter=IsActiveEntity eq false`)

      // Expected result: D1 is returned
      const d1 = data.value.find(o => o.ID === orderID)
      expect(d1).to.not.be.undefined
      expect(d1.isDeleted).to.be.false
      expect(d1.IsActiveEntity).to.be.false
    })
  })

  describe('READ-D-02: Draft root + isDeleted=true filter (no match)', () => {
    it('Draft roots are not soft deleted per specification', async () => {
      const orderID = 'D2'

      // Create draft
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Operation: GET /OrderService/Orders_draft?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted eq true`)

      // Expected result: Empty array (draft created in this test does not match)
      const result = data.value.filter(o => o.ID === orderID)
      expect(result).to.have.lengthOf(0)
    })
  })

  describe('READ-D-03: Draft root by key (non-deleted)', () => {
    it('Draft root can be retrieved by key', async () => {
      const orderID = 'D3'

      // Prerequisite
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Operation: GET /OrderService/Orders_draft('D3')
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)

      // Expected result: D3 is returned
      expect(data.ID).to.equal(orderID)
      expect(data.IsActiveEntity).to.be.false
    })
  })

  describe('READ-D-04: Draft children list (including deleted)', () => {
    it('Draft children list returns isDeleted=true entries (deletions during draft editing are visible)', async () => {
      const orderID = 'D4'
      const item1ID = 'DI41'
      const item2ID = 'DI42'

      // Prerequisite: DI41: false, DI42: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Activate draft
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete DI42
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // Operation: /OrderItems_draft?$filter=IsActiveEntity eq false
      const { data } = await GET(`/odata/v4/order-draft/OrderItems?$filter=IsActiveEntity eq false`)

      // Expected result: Both DI41 and DI42 are returned (including deleted)
      const result = data.value.filter(i => [item1ID, item2ID].includes(i.ID))
      expect(result).to.have.lengthOf(2)

      const item1 = result.find(i => i.ID === item1ID)
      const item2 = result.find(i => i.ID === item2ID)

      expect(item1.isDeleted).to.be.false
      expect(item2.isDeleted).to.be.true
    })
  })

  describe('READ-D-05: Draft child by key (deleted entries also returned)', () => {
    it('Draft child by key returns deleted entries', async () => {
      const orderID = 'D6'
      const itemID = 'DI6'

      // Prerequisite: DI6: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Activate draft
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete DI6
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Operation: /OrderItems_draft('DI6')
      const { data } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Expected result: DI6 is returned
      expect(data.ID).to.equal(itemID)
      expect(data.isDeleted).to.be.true
    })
  })

  describe('READ-D-06: Non-deleted parent draft + $expand (including deleted children)', () => {
    it('$expand on non-deleted parent draft includes deleted children (deletions during draft editing are visible)', async () => {
      const orderID = 'D7'
      const item1ID = 'DI71'
      const item2ID = 'DI72'

      // Prerequisite: D7: false, DI71: false, DI72: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Activate draft
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete DI72
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // Operation: /Orders_draft('D7')?$expand=items
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)?$expand=items`)

      // Expected result: items includes both DI71 and DI72 (including deleted)
      expect(data.items).to.have.lengthOf(2)

      const item1 = data.items.find(i => i.ID === item1ID)
      const item2 = data.items.find(i => i.ID === item2ID)

      expect(item1.isDeleted).to.be.false
      expect(item2.isDeleted).to.be.true
    })
  })

  describe('READ-D-07: Non-deleted parent draft + Navigation + isDeleted=true', () => {
    it('Navigation + filter returns only deleted entries', async () => {
      const orderID = 'D8'
      const item1ID = 'DI81'
      const item2ID = 'DI82'

      // Prerequisite
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Activate draft
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete DI82
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // Operation: /Orders_draft('D8')/items?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/items?$filter=isDeleted eq true`)

      // Expected result: Only DI82 is returned
      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].ID).to.equal(item2ID)
    })
  })

})
