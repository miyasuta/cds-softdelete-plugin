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

  describe('Draft edit mode deletion (Object Page scenario)', () => {

    it('should not return deleted items when reading via active Order navigation path', async () => {
      // This test verifies the bug: After deleting an item in draft mode and activating,
      // reading Orders(IsActiveEntity=true)/items should NOT include the deleted item
      const orderID = 'd0044001-0001-0001-0001-000000000001'
      const item1ID = 'd0044001-0001-0001-0001-000000000011'
      const item2ID = 'd0044001-0001-0001-0001-000000000012'

      await createAndActivateOrderWithItems(orderID, item1ID, item2ID)

      // Edit the order (create draft)
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete item1 in draft mode (simulating Object Page deletion)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=false)`)

      // Activate the draft
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Read items via navigation path from active Order (this is what UI does on refresh)
      const { data: itemsViaNav } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/items`)

      // The deleted item should NOT be included
      expect(itemsViaNav.value).to.have.lengthOf(1)
      expect(itemsViaNav.value[0].ID).to.equal(item2ID)
      expect(itemsViaNav.value[0].isDeleted).to.be.false

      // Verify deleted item is actually soft deleted
      const { data: deletedItems } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(deletedItems.value).to.have.lengthOf(1)
      expect(deletedItems.value[0].isDeleted).to.be.true
    })

    it('should handle deletion via navigation path (Orders/items)', async () => {
      // This test replicates the UI deletion pattern: DELETE Orders(...)/items(...)
      // When deleting via navigation, req.data may contain parent keys
      const orderID = 'd0045001-0001-0001-0001-000000000001'
      const item1ID = 'd0045001-0001-0001-0001-000000000011'
      const note1ID = 'd0045001-0001-0001-0001-000000000021'

      // Create and activate order with item and note
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        total: 100.00,
        items: [
          {
            ID: item1ID,
            quantity: 5,
            notes: [
              { ID: note1ID, text: 'Note 1' }
            ]
          }
        ]
      })
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Edit the order (create draft)
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete the item via navigation path - mimics UI behavior
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/items(ID=${item1ID},IsActiveEntity=false)`)

      // If we get here without FK errors, the test passes
    })

    it('should soft delete OrderItem when deleted in draft edit mode', async () => {
      const orderID = 'd0050001-0001-0001-0001-000000000001'
      const item1ID = 'd0050001-0001-0001-0001-000000000011'
      const item2ID = 'd0050001-0001-0001-0001-000000000012'

      await createAndActivateOrderWithItems(orderID, item1ID, item2ID)

      // Edit the order (create draft)
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete one item in draft mode (simulating Object Page edit mode deletion)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=false)`)

      // Activate the draft
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Verify the deleted item is soft deleted in active entity
      const { data: itemsData } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(itemsData.value).to.have.lengthOf(1)
      expect(itemsData.value[0].isDeleted).to.be.true
      expect(itemsData.value[0].order_ID).to.equal(orderID)

      // Verify the other item is still active
      const { data: activeItemData } = await GET(`/odata/v4/order-draft/OrderItems(ID=${item2ID},IsActiveEntity=true)`)
      expect(activeItemData.isDeleted).to.be.false
    })

    it('should cascade soft delete to OrderItemNotes when OrderItem is deleted in draft edit mode', async () => {
      const orderID = 'd0060001-0001-0001-0001-000000000001'
      const item1ID = 'd0060001-0001-0001-0001-000000000011'
      const item2ID = 'd0060001-0001-0001-0001-000000000012'
      const note1ID = 'd0060001-0001-0001-0001-000000000021'
      const note2ID = 'd0060001-0001-0001-0001-000000000022'
      const note3ID = 'd0060001-0001-0001-0001-000000000023'

      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Edit the order (create draft)
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete item1 (which has note1 and note2) in draft mode
      await DELETE(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=false)`)

      // Activate the draft
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Verify the deleted item is soft deleted
      const { data: itemData } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(itemData.value).to.have.lengthOf(1)
      expect(itemData.value[0].isDeleted).to.be.true

      // Verify the notes of deleted item are also soft deleted
      const { data: deletedNotesData } = await GET(`/odata/v4/order-draft/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const deletedNotes = deletedNotesData.value.filter(note => [note1ID, note2ID].includes(note.ID))
      expect(deletedNotes).to.have.lengthOf(2)
      deletedNotes.forEach(note => {
        expect(note.isDeleted).to.be.true
        expect(note.item_ID).to.equal(item1ID)
      })

      // Verify item2 and its note (note3) are still active
      const { data: activeItemData } = await GET(`/odata/v4/order-draft/OrderItems(ID=${item2ID},IsActiveEntity=true)`)
      expect(activeItemData.isDeleted).to.be.false

      const { data: activeNoteData } = await GET(`/odata/v4/order-draft/OrderItemNotes(ID=${note3ID},IsActiveEntity=true)`)
      expect(activeNoteData.isDeleted).to.be.false
    })

  })

  describe('Navigation path access to soft-deleted parent (Object Page scenario)', () => {

    it('should display items when accessing soft-deleted Order via navigation path', async () => {
      // This test reproduces the issue reported:
      // When accessing a soft-deleted Order's items via navigation path
      // (Orders(ID=xxx,IsActiveEntity=true)/items), the items should be displayed
      // because the parent Order is accessible (by-key access allows soft-deleted records)

      const orderID = 'd0070001-0001-0001-0001-000000000001'
      const item1ID = 'd0070001-0001-0001-0001-000000000011'
      const item2ID = 'd0070001-0001-0001-0001-000000000012'

      await createAndActivateOrderWithItems(orderID, item1ID, item2ID)

      // Soft delete the order (and cascade to items)
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify order is soft deleted but accessible via by-key access
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)
      expect(orderData.ID).to.equal(orderID)
      expect(orderData.isDeleted).to.be.true

      // Access items via navigation path from soft-deleted Order
      // This simulates Object Page accessing items of a deleted Order
      const { data: itemsViaNav } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/items`)

      // Items should be displayed with isDeleted=true
      expect(itemsViaNav.value).to.have.lengthOf(2)
      expect(itemsViaNav.value[0].isDeleted).to.be.true
      expect(itemsViaNav.value[1].isDeleted).to.be.true
    })

    it('should display notes when accessing soft-deleted OrderItem via navigation path (3-level)', async () => {
      // This test verifies 3-level navigation path behavior:
      // Order (soft-deleted) -> OrderItem (soft-deleted) -> OrderItemNotes (soft-deleted)
      // When accessing notes via OrderItems(ID=xxx)/notes, the notes should be displayed
      // because the parent OrderItem is accessible via by-key access

      const orderID = 'd0080001-0001-0001-0001-000000000001'
      const item1ID = 'd0080001-0001-0001-0001-000000000011'
      const item2ID = 'd0080001-0001-0001-0001-000000000012'
      const note1ID = 'd0080001-0001-0001-0001-000000000021'
      const note2ID = 'd0080001-0001-0001-0001-000000000022'
      const note3ID = 'd0080001-0001-0001-0001-000000000023'

      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Soft delete the order (cascades to items and notes)
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify order is soft deleted
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)
      expect(orderData.ID).to.equal(orderID)
      expect(orderData.isDeleted).to.be.true

      // Verify item1 is soft deleted but accessible via by-key access
      const { data: item1Data } = await GET(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=true)`)
      expect(item1Data.ID).to.equal(item1ID)
      expect(item1Data.isDeleted).to.be.true

      // Access notes via navigation path from soft-deleted OrderItem
      const { data: notesViaNav } = await GET(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=true)/notes`)

      // Notes should be displayed with isDeleted=true
      expect(notesViaNav.value).to.have.lengthOf(2)
      const noteIDs = notesViaNav.value.map(note => note.ID)
      expect(noteIDs).to.include(note1ID)
      expect(noteIDs).to.include(note2ID)
      expect(notesViaNav.value[0].isDeleted).to.be.true
      expect(notesViaNav.value[1].isDeleted).to.be.true
    })

    it('should display notes when accessing via 2-level navigation path from soft-deleted Order', async () => {
      // This test verifies 2-level navigation path behavior:
      // Orders(ID=xxx)/items(ID=yyy)/notes should display soft-deleted notes
      // when both Order and OrderItem are soft-deleted

      const orderID = 'd0090001-0001-0001-0001-000000000001'
      const item1ID = 'd0090001-0001-0001-0001-000000000011'
      const item2ID = 'd0090001-0001-0001-0001-000000000012'
      const note1ID = 'd0090001-0001-0001-0001-000000000021'
      const note2ID = 'd0090001-0001-0001-0001-000000000022'
      const note3ID = 'd0090001-0001-0001-0001-000000000023'

      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Soft delete the order (cascades to items and notes)
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify order is soft deleted
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)
      expect(orderData.isDeleted).to.be.true

      // Access notes via 2-level navigation path: Orders(...)/items(...)/notes
      const { data: notesViaNav } = await GET(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/items(ID=${item1ID},IsActiveEntity=true)/notes`)

      // Notes should be displayed with isDeleted=true
      expect(notesViaNav.value).to.have.lengthOf(2)
      const noteIDs = notesViaNav.value.map(note => note.ID)
      expect(noteIDs).to.include(note1ID)
      expect(noteIDs).to.include(note2ID)
      expect(notesViaNav.value[0].isDeleted).to.be.true
      expect(notesViaNav.value[1].isDeleted).to.be.true
    })

  })

  describe('Prevent overwriting soft-deleted child records', () => {

    it('should NOT update deletedAt/deletedBy when cascading to already soft-deleted Items', async () => {
      // Test scenario:
      // 1. Create Order with Items
      // 2. Delete Item in draft mode and activate (Item gets deletedAt/deletedBy)
      // 3. Delete Order (should cascade but NOT overwrite Item's deletedAt/deletedBy)
      const orderID = 'd0100001-0001-0001-0001-000000000001'
      const item1ID = 'd0100001-0001-0001-0001-000000000011'
      const item2ID = 'd0100001-0001-0001-0001-000000000012'

      // Step 1: Create and activate Order with Items
      await createAndActivateOrderWithItems(orderID, item1ID, item2ID)

      // Step 2: Edit Order, delete Item1 in draft mode, and activate
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete item1 in draft mode (simulating Object Page edit mode deletion)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=false)`)

      // Activate the draft
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Verify item1 is soft deleted and get its deletedAt/deletedBy
      const { data: item1BeforeDelete } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(item1BeforeDelete.value).to.have.lengthOf(1)
      expect(item1BeforeDelete.value[0].isDeleted).to.be.true
      const originalDeletedAt = item1BeforeDelete.value[0].deletedAt
      const originalDeletedBy = item1BeforeDelete.value[0].deletedBy

      // Record deletion time for item1
      console.log(`Item1 deleted at: ${originalDeletedAt}, by: ${originalDeletedBy}`)

      // Wait a moment to ensure timestamps would be different
      await new Promise(resolve => setTimeout(resolve, 100))

      // Step 3: Delete the Order (should cascade to Items but NOT update already-deleted Item1)
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify Order is soft deleted
      const { data: orderData } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)
      expect(orderData.value).to.have.lengthOf(1)
      expect(orderData.value[0].isDeleted).to.be.true

      // Verify Item1's deletedAt/deletedBy are NOT overwritten
      const { data: item1AfterDelete } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(item1AfterDelete.value).to.have.lengthOf(1)

      console.log(`Item1 after Order delete - deletedAt: ${item1AfterDelete.value[0].deletedAt}, deletedBy: ${item1AfterDelete.value[0].deletedBy}`)

      // CRITICAL ASSERTION: deletedAt and deletedBy should remain unchanged
      expect(item1AfterDelete.value[0].deletedAt).to.equal(originalDeletedAt)
      expect(item1AfterDelete.value[0].deletedBy).to.equal(originalDeletedBy)

      // Verify Item2 is soft deleted with Order's deletion timestamp
      const { data: item2AfterDelete } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item2ID}`)
      expect(item2AfterDelete.value).to.have.lengthOf(1)
      expect(item2AfterDelete.value[0].isDeleted).to.be.true
      // Item2's deletedAt should be different from Item1's (as it was deleted with Order)
      expect(item2AfterDelete.value[0].deletedAt).to.not.equal(originalDeletedAt)
    })

    it('should NOT update deletedAt/deletedBy when cascading to already soft-deleted Notes (3-level)', async () => {
      // Test scenario for 3-level cascade:
      // 1. Create Order with Items and Notes
      // 2. Delete Item1 (and its Notes) in draft mode and activate
      // 3. Delete Order (should cascade but NOT overwrite already-deleted Item1 and its Notes)
      const orderID = 'd0110001-0001-0001-0001-000000000001'
      const item1ID = 'd0110001-0001-0001-0001-000000000011'
      const item2ID = 'd0110001-0001-0001-0001-000000000012'
      const note1ID = 'd0110001-0001-0001-0001-000000000021'
      const note2ID = 'd0110001-0001-0001-0001-000000000022'
      const note3ID = 'd0110001-0001-0001-0001-000000000023'

      // Step 1: Create and activate Order with Items and Notes
      await createAndActivateOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      // Step 2: Edit Order, delete Item1 (with Notes) in draft mode, and activate
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // Delete item1 in draft mode (this will cascade to note1 and note2)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID=${item1ID},IsActiveEntity=false)`)

      // Activate the draft
      await POST(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // Get original deletedAt/deletedBy for Item1 and its Notes
      const { data: item1Before } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(item1Before.value).to.have.lengthOf(1)
      const item1OriginalDeletedAt = item1Before.value[0].deletedAt
      const item1OriginalDeletedBy = item1Before.value[0].deletedBy

      const { data: notesBeforeOrderDelete } = await GET(`/odata/v4/order-draft/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const note1Before = notesBeforeOrderDelete.value.find(note => note.ID === note1ID)
      const note2Before = notesBeforeOrderDelete.value.find(note => note.ID === note2ID)
      expect(note1Before).to.not.be.undefined
      expect(note2Before).to.not.be.undefined
      const note1OriginalDeletedAt = note1Before.deletedAt
      const note2OriginalDeletedAt = note2Before.deletedAt

      // Wait to ensure timestamps would be different
      await new Promise(resolve => setTimeout(resolve, 100))

      // Step 3: Delete the Order (should cascade to Item2 and Note3, but NOT update Item1, Note1, Note2)
      await DELETE(`/odata/v4/order-draft/Orders(ID=${orderID},IsActiveEntity=true)`)

      // Verify Item1's deletedAt/deletedBy are NOT overwritten
      const { data: item1After } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
      expect(item1After.value).to.have.lengthOf(1)
      expect(item1After.value[0].deletedAt).to.equal(item1OriginalDeletedAt)
      expect(item1After.value[0].deletedBy).to.equal(item1OriginalDeletedBy)

      // Verify Note1 and Note2's deletedAt are NOT overwritten
      const { data: notesAfter } = await GET(`/odata/v4/order-draft/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const note1After = notesAfter.value.find(note => note.ID === note1ID)
      const note2After = notesAfter.value.find(note => note.ID === note2ID)
      expect(note1After.deletedAt).to.equal(note1OriginalDeletedAt)
      expect(note2After.deletedAt).to.equal(note2OriginalDeletedAt)

      // Verify Item2 and Note3 are soft deleted with Order's deletion timestamp
      const { data: item2After } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item2ID}`)
      expect(item2After.value).to.have.lengthOf(1)
      expect(item2After.value[0].isDeleted).to.be.true
      // Item2's deletedAt should be different from Item1's
      expect(item2After.value[0].deletedAt).to.not.equal(item1OriginalDeletedAt)

      const note3After = notesAfter.value.find(note => note.ID === note3ID)
      expect(note3After).to.not.be.undefined
      expect(note3After.isDeleted).to.be.true
      // Note3's deletedAt should be different from Note1's
      expect(note3After.deletedAt).to.not.equal(note1OriginalDeletedAt)
    })

  })

})
