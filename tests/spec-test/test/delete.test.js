const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('Deletion test cases', () => {

  describe('DEL-01: Soft delete of active root entity', () => {
    it('Active root entity becomes isDeleted=true via key-specified DELETE', async () => {
      const orderID = 'O1'

      // Prerequisite: Orders('O1'): isDeleted=false, IsActiveEntity=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // Operation: DELETE /OrderService/Orders('O1')
      const deleteRes = await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Expected result: HTTP 204
      expect(deleteRes.status).to.equal(204)

      // Expected result: Orders('O1').isDeleted == true
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(data.isDeleted).to.be.true

      // Expected result: deletedAt / deletedBy are updated
      expect(data.deletedAt).to.not.be.null
      expect(data.deletedBy).to.equal('alice')

      // Expected result: Not physically deleted (record can be retrieved)
      expect(data.ID).to.equal(orderID)
    })
  })

  describe('DEL-02: Composition children cascade from root deletion', () => {
    it('Parent DELETE causes all Composition hierarchy to be soft deleted', async () => {
      const orderID = 'O2'
      const item1ID = 'I21'
      const item2ID = 'I22'

      // Prerequisite: Orders('O2'): isDeleted=false
      //       OrderItems('I21', parent='O2'): isDeleted=false
      //       OrderItems('I22', parent='O2'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // Operation: DELETE /OrderService/Orders('O2')
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Expected result: Parent O2 becomes isDeleted=true
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.true

      // Expected result: Children I21 / I22 also become isDeleted=true
      const { data: item1 } = await GET(`/odata/v4/order/OrderItems('${item1ID}')`)
      expect(item1.isDeleted).to.be.true

      const { data: item2 } = await GET(`/odata/v4/order/OrderItems('${item2ID}')`)
      expect(item2.isDeleted).to.be.true

      // Expected result: Children I21 / I22 deletedAt / deletedBy are also updated
      expect(item1.deletedAt).to.not.be.null
      expect(item1.deletedBy).to.equal('alice')
      expect(item2.deletedAt).to.not.be.null
      expect(item2.deletedBy).to.equal('alice')
    })
  })

  describe('DEL-03: Individual DELETE of active child', () => {
    it('Child DELETE soft deletes only the child, parent remains unchanged', async () => {
      const orderID = 'O3'
      const itemID = 'I31'

      // Prerequisite: Orders('O3'): isDeleted=false
      //       OrderItems('I31'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 300.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Operation: DELETE /OrderService/OrderItems('I31')
      await DELETE(`/odata/v4/order/OrderItems('${itemID}')`)

      // Expected result: Orders('O3').isDeleted remains false
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.false

      // Expected result: OrderItems('I31').isDeleted == true
      const { data: item } = await GET(`/odata/v4/order/OrderItems('${itemID}')`)
      expect(item.isDeleted).to.be.true
    })
  })

  describe('DEL-03-extended: Grandchild cascade from child deletion', () => {
    it('When deleting a child, all grandchildren and descendants are cascade deleted', async () => {
      const orderID = 'O3B'
      const itemID = 'I31B'
      const detailID = 'D311B'

      // Prerequisite: Orders('O3B'): isDeleted=false
      //       OrderItems('I31B'): isDeleted=false
      //       ItemDetails('D311B', parent='I31B'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 300.00,
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

      // Operation: DELETE /OrderService/OrderItems('I31B')
      await DELETE(`/odata/v4/order/OrderItems('${itemID}')`)

      // Expected result: Orders('O3B').isDeleted remains false
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.false

      // Expected result: OrderItems('I31B').isDeleted == true
      const { data: item } = await GET(`/odata/v4/order/OrderItems('${itemID}')`)
      expect(item.isDeleted).to.be.true

      // Expected result: ItemDetails('D311B').isDeleted == true (grandchildren also cascade)
      const { data: detail } = await GET(`/odata/v4/order/ItemDetails('${detailID}')`)
      expect(detail.isDeleted).to.be.true

      // Expected result: ItemDetails('D311B').deletedAt / deletedBy are also updated
      expect(detail.deletedAt).to.not.be.null
      expect(detail.deletedBy).to.equal('alice')
    })
  })

  describe('DEL-04: Physical deletion on draft discard', () => {
    it('Draft discard physically deletes draft rows, not soft deleted', async () => {
      const orderID = 'OD4'
      const itemID = 'ID41'

      // Prerequisite: Orders_draft('OD4'): isDeleted=false, IsActiveEntity=false
      //       OrderItems_draft('ID41'): isDeleted=false

      // Create new draft (deep insert)
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 400.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Operation: DELETE /OrderService/Orders(ID='OD4',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)

      // Expected result: Orders_draft('OD4') is physically deleted (cannot be retrieved)
      try {
        await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)
        expect.fail('Draft order should be physically deleted')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }

      // Expected result: OrderItems_draft('ID41') is also physically deleted
      try {
        await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
        expect.fail('Draft item should be physically deleted')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }

      // Expected result: No impact on active side (active does not exist for new draft)
      try {
        await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)`)
        expect.fail('Active order should not exist for new draft')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }
    })
  })

  describe('DEL-05: Draft child deletion (isDeleted=true)', () => {
    it('Child deleted during draft editing is set to isDeleted=true', async () => {
      const orderID = 'O5'
      const itemID = 'I51'

      // Prerequisite: Orders('O5'), OrderItems('I51') are active
      // Create draft and activate
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 500.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Activate draft to make it active
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active entity as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Operation: DELETE /OrderService/OrderItems(ID='ID51',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Expected result: OrderItems_draft('ID51').isDeleted == true
      const { data: draftItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
      expect(draftItem.isDeleted).to.be.true

      // Expected result: OrderItems_draft('ID51').deletedAt / deletedBy are updated
      expect(draftItem.deletedAt).to.not.be.null
      expect(draftItem.deletedBy).to.equal('alice')

      // Expected result: Active side is not yet deleted
      const { data: activeItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=true)`)
      expect(activeItem.isDeleted).to.be.false
    })
  })

  describe('DEL-05-extended: Grandchild cascade from draft child deletion', () => {
    it('When deleting a child in draft, grandchildren also cascade to isDeleted=true', async () => {
      const orderID = 'OD5B'
      const itemID = 'ID51B'
      const detailID = 'D511B'

      // Prerequisite: Orders_draft('OD5B'), OrderItems_draft('ID51B'), ItemDetails_draft('D511B') exist
      // Create draft and activate
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 500.00,
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

      // Activate draft to make it active
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit active entity as draft again
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Operation: DELETE /OrderService/OrderItems(ID='ID51B',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Expected result: OrderItems_draft('ID51B').isDeleted == true
      const { data: draftItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
      expect(draftItem.isDeleted).to.be.true

      // Expected result: ItemDetails_draft('D511B').isDeleted == true (grandchildren also cascade)
      const { data: draftDetail } = await GET(`/odata/v4/order-draft/ItemDetails(ID='${detailID}',IsActiveEntity=false)`)
      expect(draftDetail.isDeleted).to.be.true

      // Expected result: ItemDetails_draft('D511B').deletedAt / deletedBy are also updated
      expect(draftDetail.deletedAt).to.not.be.null
      expect(draftDetail.deletedBy).to.equal('alice')
    })
  })

  describe('DEL-06: Re-DELETE on isDeleted=true record (idempotency)', () => {
    it('DELETE on already isDeleted=true record succeeds with no side effects', async () => {
      const orderID = 'O6'

      // Prerequisite: Orders('O6'): isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 600.00
      })

      // First deletion
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Get state after deletion
      const { data: firstDelete } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      const firstDeletedAt = firstDelete.deletedAt
      const firstDeletedBy = firstDelete.deletedBy

      // Operation: DELETE /OrderService/Orders('O6') (second time)
      const deleteRes = await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // Expected result: HTTP 204
      expect(deleteRes.status).to.equal(204)

      // Expected result: isDeleted / deletedAt / deletedBy are not changed
      const { data: secondDelete } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(secondDelete.isDeleted).to.be.true
      expect(secondDelete.deletedAt).to.equal(firstDeletedAt)
      expect(secondDelete.deletedBy).to.equal(firstDeletedBy)
    })
  })

})
