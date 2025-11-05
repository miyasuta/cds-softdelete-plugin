const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('OrderService - Soft Delete Tests for Child Entity', () => {

  it('should soft delete OrderItem when deleted directly', async () => {
    // Create Order with items
    const orderID = '12345678-1234-1234-1234-123456789abc'
    const item1ID = '87654321-4321-4321-4321-cba987654321'
    const item2ID = '11111111-2222-3333-4444-555555555555'

    await POST(`/odata/v4/order/Orders`, {
      ID: orderID,
      createdAt: new Date().toISOString(),
      total: 100.00
    })
    await POST(`/odata/v4/order/OrderItems`, { ID: item1ID, order_ID: orderID, quantity: 5 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item2ID, order_ID: orderID, quantity: 10 })

    // Delete first item
    const deleteResponse = await DELETE(`/odata/v4/order/OrderItems(${item1ID})`)
    expect(deleteResponse.status).to.equal(204)

    // Verify only one active item remains
    const { data: orderAfter } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items`)
    expect(orderAfter.items).to.have.lengthOf(1)
    expect(orderAfter.items[0].ID).to.equal(item2ID)

    // Verify deleted item is NOT found in normal query
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/order/OrderItems(${item1ID})`)
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CAN be retrieved with isDeleted=true filter
    const { data: deletedGet } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)
    expect(deletedGet.value).to.have.lengthOf(1)
    expect(deletedGet.value[0]).to.containSubset({ ID: item1ID, quantity: 5, isDeleted: true })
  })

  it('should cascade soft delete from parent Order through multiple levels', async () => {
    // Test 2-level cascade
    const order1ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const order1Item1ID = 'item1111-1111-1111-1111-111111111111'
    const order1Item2ID = 'item2222-2222-2222-2222-222222222222'

    await POST(`/odata/v4/order/Orders`, { ID: order1ID, createdAt: new Date().toISOString(), total: 200.00 })
    await POST(`/odata/v4/order/OrderItems`, { ID: order1Item1ID, order_ID: order1ID, quantity: 3 })
    await POST(`/odata/v4/order/OrderItems`, { ID: order1Item2ID, order_ID: order1ID, quantity: 7 })

    // Delete parent Order
    await DELETE(`/odata/v4/order/Orders(${order1ID})`)

    // Verify Order is soft deleted
    let orderGetFailed = false
    try {
      await GET(`/odata/v4/order/Orders(${order1ID})`)
    } catch (error) {
      orderGetFailed = error.response.status === 404
    }
    expect(orderGetFailed).to.be.true

    const { data: deletedOrder } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${order1ID}`)
    expect(deletedOrder.value).to.have.lengthOf(1)
    expect(deletedOrder.value[0].isDeleted).to.be.true

    // Verify OrderItems are cascaded soft deleted
    const { data: deletedItems } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${order1ID}`)
    expect(deletedItems.value).to.have.lengthOf(2)
    const itemIDs = deletedItems.value.map(item => item.ID)
    expect(itemIDs).to.include(order1Item1ID)
    expect(itemIDs).to.include(order1Item2ID)

    // Test 3-level cascade
    const order2ID = 'eeeeeeee-ffff-0000-1111-222222222222'
    const item1ID = 'eeeeeeee-ffff-0000-1111-222222222223'
    const item2ID = 'eeeeeeee-ffff-0000-1111-222222222224'
    const note1ID = 'eeeeeeee-ffff-0000-1111-222222222225'
    const note2ID = 'eeeeeeee-ffff-0000-1111-222222222226'
    const note3ID = 'eeeeeeee-ffff-0000-1111-222222222227'

    await POST(`/odata/v4/order/Orders`, { ID: order2ID, createdAt: new Date().toISOString(), total: 500.00 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item1ID, order_ID: order2ID, quantity: 5 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item2ID, order_ID: order2ID, quantity: 10 })
    await POST(`/odata/v4/order/OrderItemNotes`, { ID: note1ID, item_ID: item1ID, text: 'Note 1' })
    await POST(`/odata/v4/order/OrderItemNotes`, { ID: note2ID, item_ID: item1ID, text: 'Note 2' })
    await POST(`/odata/v4/order/OrderItemNotes`, { ID: note3ID, item_ID: item2ID, text: 'Note 3' })

    // Verify structure before deletion
    const { data: orderBefore } = await GET(`/odata/v4/order/Orders(${order2ID})?$expand=items($expand=notes)`)
    expect(orderBefore.items).to.have.lengthOf(2)
    expect(orderBefore.items[0].notes).to.have.lengthOf(2)
    expect(orderBefore.items[1].notes).to.have.lengthOf(1)

    // Delete parent Order
    await DELETE(`/odata/v4/order/Orders(${order2ID})`)

    // Verify Order is soft deleted
    const { data: deletedOrder2 } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${order2ID}`)
    expect(deletedOrder2.value).to.have.lengthOf(1)
    expect(deletedOrder2.value[0].isDeleted).to.be.true

    // Verify OrderItems (Level 2) are soft deleted
    const { data: deletedItems2 } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${order2ID}`)
    expect(deletedItems2.value).to.have.lengthOf(2)
    const item2IDs = deletedItems2.value.map(item => item.ID)
    expect(item2IDs).to.include(item1ID)
    expect(item2IDs).to.include(item2ID)

    // Verify OrderItemNotes (Level 3) are also soft deleted
    const { data: deletedNotes } = await GET(`/odata/v4/order/OrderItemNotes?$filter=isDeleted%20eq%20true`)
    const testNotes = deletedNotes.value.filter(note => [note1ID, note2ID, note3ID].includes(note.ID))
    expect(testNotes).to.have.lengthOf(3)
    testNotes.forEach(note => expect(note.isDeleted).to.be.true)
  })

  it('should handle $expand with isDeleted filters correctly', async () => {
    // Setup: Create Order with items, then delete parent
    const order1ID = 'cccccccc-dddd-eeee-ffff-000000000001'
    const item1ID = 'cccccccc-dddd-eeee-ffff-000000000011'
    const item2ID = 'cccccccc-dddd-eeee-ffff-000000000012'

    await POST(`/odata/v4/order/Orders`, { ID: order1ID, createdAt: new Date().toISOString(), total: 300.00 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item1ID, order_ID: order1ID, quantity: 5 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item2ID, order_ID: order1ID, quantity: 8 })
    await DELETE(`/odata/v4/order/Orders(${order1ID})`)

    // Query deleted Order with $expand - should include deleted items
    const { data: deletedOrderWithItems } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${order1ID}&$expand=items`)
    expect(deletedOrderWithItems.value).to.have.lengthOf(1)
    expect(deletedOrderWithItems.value[0].isDeleted).to.be.true
    expect(deletedOrderWithItems.value[0].items).to.have.lengthOf(2)
    deletedOrderWithItems.value[0].items.forEach(item => {
      expect(item.isDeleted).to.be.true
      expect(item.deletedBy).to.equal('alice')
    })

    // Query active Orders - should NOT include deleted items
    const { data: activeOrders } = await GET(`/odata/v4/order/Orders?$expand=items`)
    activeOrders.value.forEach(order => {
      order.items.forEach(item => {
        expect([item1ID, item2ID]).to.not.include(item.ID)
      })
    })

    // Setup: Create Order with items, delete only one item
    const order2ID = 'dddddddd-eeee-ffff-0000-000000000001'
    const item3ID = 'dddddddd-eeee-ffff-0000-000000000011'
    const item4ID = 'dddddddd-eeee-ffff-0000-000000000012'

    await POST(`/odata/v4/order/Orders`, { ID: order2ID, createdAt: new Date().toISOString(), total: 400.00 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item3ID, order_ID: order2ID, quantity: 3 })
    await POST(`/odata/v4/order/OrderItems`, { ID: item4ID, order_ID: order2ID, quantity: 7 })
    await DELETE(`/odata/v4/order/OrderItems(${item3ID})`)

    // Test explicit isDeleted filters in $expand
    const { data: orderWithDeletedItems } = await GET(`/odata/v4/order/Orders(${order2ID})?$expand=items($filter=isDeleted%20eq%20true)`)
    expect(orderWithDeletedItems.items).to.have.lengthOf(1)
    expect(orderWithDeletedItems.items[0].ID).to.equal(item3ID)
    expect(orderWithDeletedItems.items[0].isDeleted).to.be.true

    const { data: orderWithActiveItems } = await GET(`/odata/v4/order/Orders(${order2ID})?$expand=items($filter=isDeleted%20eq%20false)`)
    expect(orderWithActiveItems.items).to.have.lengthOf(1)
    expect(orderWithActiveItems.items[0].ID).to.equal(item4ID)
    expect(orderWithActiveItems.items[0].isDeleted).to.be.false

    // Default $expand should show only active items
    const { data: orderDefault } = await GET(`/odata/v4/order/Orders(${order2ID})?$expand=items`)
    expect(orderDefault.items).to.have.lengthOf(1)
    expect(orderDefault.items[0].ID).to.equal(item4ID)
  })

})
