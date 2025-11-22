const cds = require('@sap/cds')

const { GET, POST, DELETE, PATCH, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

// Helper function: Create draft Order and activate it
async function createAndActivateOrder(orderID, total = 100.00) {
  // Create draft
  const draftOrder = await POST(`/odata/v4/order-draft/Orders`, {
    ID: orderID,
    total: total
  })

  // Activate draft (draftActivate action)
  await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

  return draftOrder
}

// Helper function: Create draft Order with Items and activate using deep insert
async function createAndActivateOrderWithItems(orderID, item1ID, item2ID) {
  // Create draft order with items using deep insert
  await POST(`/odata/v4/order-draft/Orders`, {
    ID: orderID,
    total: 100.00,
    items: [
      { ID: item1ID, quantity: 5 },
      { ID: item2ID, quantity: 10 }
    ]
  })

  // Activate draft
  await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)
}

// Helper function: Create draft Order with Items and Notes, then activate using deep insert
async function createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID) {
  // Create draft order with items and notes using deep insert
  await POST(`/odata/v4/order-draft/Orders`, {
    ID: orderID,
    total: 500.00,
    items: [
      {
        ID: item1ID,
        quantity: 5,
        notes: [
          { ID: note1ID, text: 'Note 1' },
          { ID: note2ID, text: 'Note 2' }
        ]
      },
      {
        ID: item2ID,
        quantity: 10,
        notes: [
          { ID: note3ID, text: 'Note 3' }
        ]
      }
    ]
  })

  // Activate draft
  await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)
}

describe('OrderDraftService - Draft-enabled Cascade Soft Delete Tests', () => {

  describe('Draft activation and basic operations', () => {

    it('should create and activate a draft order', async () => {
      const orderID = 'd0010001-0001-0001-0001-000000000001'

      await createAndActivateOrder(orderID)

      const { data } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      expect(data.ID).to.equal(orderID)
      expect(data.IsActiveEntity).to.be.true
      expect(data.isDeleted).to.be.false
    })

  })

  describe('2-level cascade deletion (Order -> OrderItems)', () => {

    it('should cascade soft delete to OrderItems when deleting active Order', async () => {
      const orderID = 'd0020001-0001-0001-0001-000000000001'
      const item1ID = 'd0020001-0001-0001-0001-000000000011'
      const item2ID = 'd0020001-0001-0001-0001-000000000012'

      await createAndActivateOrderWithItems(orderID, item1ID, item2ID)

      // Delete active order
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify order is soft deleted
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)
      expect(orderData.value).to.have.lengthOf(1)
      expect(orderData.value[0].isDeleted).to.be.true

      // Verify items are cascade soft deleted
      const { data: itemsData } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${orderID}`)
      expect(itemsData.value).to.have.lengthOf(2)
      const itemIDs = itemsData.value.map(item => item.ID)
      expect(itemIDs).to.include(item1ID)
      expect(itemIDs).to.include(item2ID)
    })

  })

  describe('3-level cascade deletion (Order -> OrderItems -> OrderItemNotes)', () => {

    it('should cascade soft delete to all levels when deleting active Order', async () => {
      const orderID = 'd0030001-0001-0001-0001-000000000001'
      const item1ID = 'd0030001-0001-0001-0001-000000000011'
      const item2ID = 'd0030001-0001-0001-0001-000000000012'
      const note1ID = 'd0030001-0001-0001-0001-000000000021'
      const note2ID = 'd0030001-0001-0001-0001-000000000022'
      const note3ID = 'd0030001-0001-0001-0001-000000000023'

      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Delete active order
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify order is soft deleted
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)
      expect(orderData.value).to.have.lengthOf(1)
      expect(orderData.value[0].isDeleted).to.be.true

      // Verify items are cascade soft deleted
      const { data: itemsData } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${orderID}`)
      expect(itemsData.value).to.have.lengthOf(2)

      // Verify notes are cascade soft deleted
      const { data: notesData } = await GET(`/odata/v4/order-draft/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const testNotes = notesData.value.filter(note => [note1ID, note2ID, note3ID].includes(note.ID))
      expect(testNotes).to.have.lengthOf(3)
      testNotes.forEach(note => expect(note.isDeleted).to.be.true)
    })

  })

  describe('Child key extraction without draft virtual keys', () => {

    it('should correctly extract child keys without IsActiveEntity for recursive cascade', async () => {
      // This test verifies that when recursively cascading soft delete,
      // the child keys are correctly extracted without draft virtual keys.
      // If IsActiveEntity is included in child keys, it would cause errors
      // when trying to build WHERE conditions for grandchildren.

      const orderID = 'd0040001-0001-0001-0001-000000000001'
      const item1ID = 'd0040001-0001-0001-0001-000000000011'
      const item2ID = 'd0040001-0001-0001-0001-000000000012'
      const note1ID = 'd0040001-0001-0001-0001-000000000021'
      const note2ID = 'd0040001-0001-0001-0001-000000000022'
      const note3ID = 'd0040001-0001-0001-0001-000000000023'

      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Delete active order - this should cascade to items and notes
      // without errors from IsActiveEntity being included in child keys
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify all levels are soft deleted correctly
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)
      expect(orderData.value).to.have.lengthOf(1)

      const { data: itemsData } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${orderID}`)
      expect(itemsData.value).to.have.lengthOf(2)

      const { data: notesData } = await GET(`/odata/v4/order-draft/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const testNotes = notesData.value.filter(note => [note1ID, note2ID, note3ID].includes(note.ID))
      expect(testNotes).to.have.lengthOf(3)
    })

  })

})
