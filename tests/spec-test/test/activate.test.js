const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('Draft activation test cases', () => {

  describe('ACT-01: Activate new draft child with isDeleted=true (not created in active)', () => {
    it('When new child is isDeleted=true, it is not created in active', async () => {
      const orderID = 'A100'
      const itemID = 'DI101'

      // Prerequisite: Active side: Only Orders('A100'), no children
      //       Draft: Orders_draft('D100')
      //       Draft child DI101: isDeleted=true (new child never activated before)
      //       No corresponding child record exists on active side

      // Create new draft
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // Delete draft child (set isDeleted=true)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Operation: POST /OrderService/Orders(ID='A100',IsActiveEntity=true)/OrderService.draftActivate
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Expected result: No child corresponding to DI101 is created on active side OrderItems
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)?$expand=items`)

      expect(data.items).to.have.lengthOf(0)
    })
  })

  describe('ACT-02: Activate existing child with isDeleted=true (reflected in active)', () => {
    it('Existing child isDeleted=true is reflected in active', async () => {
      const orderID = 'A200'
      const itemID = 'AI201'

      // Prerequisite: Active side: Orders('A200'), OrderItems('AI201': isDeleted=false)
      //       Draft side: Orders_draft('D200')
      //       Draft child DI201: isDeleted=true (corresponds to AI201)

      // Create active entity
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00,
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

      // Delete draft child (set isDeleted=true)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // Operation: POST /OrderService/Orders(ID='A200',IsActiveEntity=true)/OrderService.draftActivate
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Expected result: Active OrderItems('AI201').isDeleted == true
      const { data: activeItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=true)`)
      expect(activeItem.isDeleted).to.be.true

      // Expected result: Active OrderItems('AI201').deletedAt / deletedBy are also updated
      expect(activeItem.deletedAt).to.not.be.null
      expect(activeItem.deletedBy).to.equal('alice')
    })
  })

})
