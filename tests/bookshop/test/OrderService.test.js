const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('OrderService - Soft Delete Tests for Child Entity', () => {

  it('should soft delete OrderItem when deleted directly (with @softdelete.enabled)', async () => {
    // Create a new Order
    const newOrder = {
      ID: '12345678-1234-1234-1234-123456789abc',
      createdAt: new Date().toISOString(),
      total: 100.00,
      items: []
    }

    const createOrderResponse = await POST(`/odata/v4/order/Orders`, newOrder)
    expect(createOrderResponse.status).to.equal(201)

    // Create two OrderItems for this Order
    const orderItem1 = {
      ID: '87654321-4321-4321-4321-cba987654321',
      order_ID: '12345678-1234-1234-1234-123456789abc',
      quantity: 5
    }

    const orderItem2 = {
      ID: '11111111-2222-3333-4444-555555555555',
      order_ID: '12345678-1234-1234-1234-123456789abc',
      quantity: 10
    }

    await POST(`/odata/v4/order/OrderItems`, orderItem1)
    await POST(`/odata/v4/order/OrderItems`, orderItem2)

    // Verify both items exist before deletion
    const { data: orderBefore } = await GET(`/odata/v4/order/Orders(12345678-1234-1234-1234-123456789abc)?$expand=items`)
    expect(orderBefore.items).to.have.lengthOf(2)

    // Delete the first OrderItem directly (should be soft delete with @softdelete.enabled)
    const deleteResponse = await DELETE(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify only one active item remains (soft-deleted item is filtered out)
    const { data: orderAfter } = await GET(`/odata/v4/order/Orders(12345678-1234-1234-1234-123456789abc)?$expand=items`)
    expect(orderAfter.items).to.have.lengthOf(1)
    expect(orderAfter.items[0]).to.containSubset({
      ID: '11111111-2222-3333-4444-555555555555'
    })

    // Verify deleted item is NOT found in normal query (soft deleted, so filtered out)
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`)
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CAN be retrieved with isDeleted=true filter (soft delete)
    const { data: deletedGet } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%2087654321-4321-4321-4321-cba987654321&$select=ID,quantity,isDeleted`)
    expect(deletedGet.value).to.have.lengthOf(1)
    expect(deletedGet.value[0]).to.containSubset({
      ID: '87654321-4321-4321-4321-cba987654321',
      quantity: 5,
      isDeleted: true
    })
  })

  it('should cascade soft delete from parent Order to composition children OrderItems', async () => {
    // Create a new Order
    const newOrder = {
      ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      createdAt: new Date().toISOString(),
      total: 200.00,
      items: []
    }

    const createOrderResponse = await POST(`/odata/v4/order/Orders`, newOrder)
    expect(createOrderResponse.status).to.equal(201)

    // Create two OrderItems for this Order
    const orderItem1 = {
      ID: 'item1111-1111-1111-1111-111111111111',
      order_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      quantity: 3
    }

    const orderItem2 = {
      ID: 'item2222-2222-2222-2222-222222222222',
      order_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      quantity: 7
    }

    await POST(`/odata/v4/order/OrderItems`, orderItem1)
    await POST(`/odata/v4/order/OrderItems`, orderItem2)

    // Verify both items exist before deletion
    const { data: orderBefore } = await GET(`/odata/v4/order/Orders(aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)?$expand=items`)
    expect(orderBefore.items).to.have.lengthOf(2)

    // Delete the parent Order
    const deleteResponse = await DELETE(`/odata/v4/order/Orders(aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify Order is not returned in normal GET (soft deleted)
    let orderGetFailed = false
    try {
      await GET(`/odata/v4/order/Orders(aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)`)
    } catch (error) {
      orderGetFailed = error.response.status === 404
    }
    expect(orderGetFailed).to.be.true

    // Verify Order can be retrieved with isDeleted=true filter
    const { data: deletedOrder } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&$select=ID,isDeleted`)
    expect(deletedOrder.value).to.have.lengthOf(1)
    expect(deletedOrder.value[0]).to.containSubset({
      ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      isDeleted: true
    })

    // Verify OrderItems are also soft deleted (cascaded)
    const { data: deletedItems } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&$select=ID,quantity,isDeleted`)
    expect(deletedItems.value).to.have.lengthOf(2)
    const itemIDs = deletedItems.value.map(item => item.ID)
    expect(itemIDs).to.include('item1111-1111-1111-1111-111111111111')
    expect(itemIDs).to.include('item2222-2222-2222-2222-222222222222')
    deletedItems.value.forEach(item => {
      expect(item.isDeleted).to.be.true
    })

    // Verify OrderItems are NOT returned in normal GET requests (auto-filtered with @softdelete.enabled)
    const { data: normalItems } = await GET(`/odata/v4/order/OrderItems?$filter=order_ID%20eq%20aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&$select=ID,quantity`)
    expect(normalItems.value).to.have.lengthOf(0)
  })

  it('should propagate isDeleted filter to composition children in $expand', async () => {
    // Create a new Order
    const newOrder = {
      ID: 'cccccccc-dddd-eeee-ffff-000000000001',
      createdAt: new Date().toISOString(),
      total: 300.00,
      items: []
    }

    await POST(`/odata/v4/order/Orders`, newOrder)

    // Create OrderItems
    const orderItem1 = {
      ID: 'cccccccc-dddd-eeee-ffff-000000000011',
      order_ID: 'cccccccc-dddd-eeee-ffff-000000000001',
      quantity: 5
    }

    const orderItem2 = {
      ID: 'cccccccc-dddd-eeee-ffff-000000000012',
      order_ID: 'cccccccc-dddd-eeee-ffff-000000000001',
      quantity: 8
    }

    await POST(`/odata/v4/order/OrderItems`, orderItem1)
    await POST(`/odata/v4/order/OrderItems`, orderItem2)

    // Delete the parent Order
    await DELETE(`/odata/v4/order/Orders(cccccccc-dddd-eeee-ffff-000000000001)`)

    // Query deleted Order with $expand - should include deleted items
    const { data: deletedOrderWithItems } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20cccccccc-dddd-eeee-ffff-000000000001&$expand=items&$select=ID,isDeleted`)
    expect(deletedOrderWithItems.value).to.have.lengthOf(1)
    expect(deletedOrderWithItems.value[0].isDeleted).to.be.true
    expect(deletedOrderWithItems.value[0].items).to.have.lengthOf(2)
    const expandedItemIDs = deletedOrderWithItems.value[0].items.map(item => item.ID)
    expect(expandedItemIDs).to.include('cccccccc-dddd-eeee-ffff-000000000011')
    expect(expandedItemIDs).to.include('cccccccc-dddd-eeee-ffff-000000000012')
    deletedOrderWithItems.value[0].items.forEach(item => {
      expect(item.isDeleted).to.be.true
      expect(item.deletedBy).to.equal('alice')
    })

    // Query non-deleted Orders with $expand - should NOT include deleted items
    const { data: activeOrders } = await GET(`/odata/v4/order/Orders?$expand=items`)
    // All active orders should NOT include the deleted order's items
    activeOrders.value.forEach(order => {
      order.items.forEach(item => {
        expect(item.ID).to.not.equal('cccccccc-dddd-eeee-ffff-000000000011')
        expect(item.ID).to.not.equal('cccccccc-dddd-eeee-ffff-000000000012')
      })
    })
  })

  it('should respect explicit isDeleted filter in $expand', async () => {
    // Create a new Order
    const newOrder = {
      ID: 'dddddddd-eeee-ffff-0000-000000000001',
      createdAt: new Date().toISOString(),
      total: 400.00,
      items: []
    }

    await POST(`/odata/v4/order/Orders`, newOrder)

    // Create OrderItems
    const orderItem1 = {
      ID: 'dddddddd-eeee-ffff-0000-000000000011',
      order_ID: 'dddddddd-eeee-ffff-0000-000000000001',
      quantity: 3
    }

    const orderItem2 = {
      ID: 'dddddddd-eeee-ffff-0000-000000000012',
      order_ID: 'dddddddd-eeee-ffff-0000-000000000001',
      quantity: 7
    }

    await POST(`/odata/v4/order/OrderItems`, orderItem1)
    await POST(`/odata/v4/order/OrderItems`, orderItem2)

    // Delete only one OrderItem
    await DELETE(`/odata/v4/order/OrderItems(dddddddd-eeee-ffff-0000-000000000011)`)

    // Query Order with explicit filter to show only deleted items in $expand
    const { data: orderWithDeletedItems } = await GET(`/odata/v4/order/Orders(dddddddd-eeee-ffff-0000-000000000001)?$expand=items($filter=isDeleted%20eq%20true)`)
    expect(orderWithDeletedItems.items).to.have.lengthOf(1)
    expect(orderWithDeletedItems.items[0].ID).to.equal('dddddddd-eeee-ffff-0000-000000000011')
    expect(orderWithDeletedItems.items[0].isDeleted).to.be.true

    // Query Order with explicit filter to show only active items in $expand
    const { data: orderWithActiveItems } = await GET(`/odata/v4/order/Orders(dddddddd-eeee-ffff-0000-000000000001)?$expand=items($filter=isDeleted%20eq%20false)`)
    expect(orderWithActiveItems.items).to.have.lengthOf(1)
    expect(orderWithActiveItems.items[0].ID).to.equal('dddddddd-eeee-ffff-0000-000000000012')
    expect(orderWithActiveItems.items[0].isDeleted).to.be.false

    // Query Order with default $expand (should show only active items)
    const { data: orderDefault } = await GET(`/odata/v4/order/Orders(dddddddd-eeee-ffff-0000-000000000001)?$expand=items`)
    expect(orderDefault.items).to.have.lengthOf(1)
    expect(orderDefault.items[0].ID).to.equal('dddddddd-eeee-ffff-0000-000000000012')
  })

  it('should cascade soft delete through 3 levels (Order -> OrderItems -> OrderItemNotes)', async () => {
    // Create a new Order
    const newOrder = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222222',
      createdAt: new Date().toISOString(),
      total: 500.00,
      items: []
    }

    const createOrderResponse = await POST(`/odata/v4/order/Orders`, newOrder)
    expect(createOrderResponse.status).to.equal(201)

    // Create OrderItems (Level 2)
    const orderItem1 = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222223',
      order_ID: 'eeeeeeee-ffff-0000-1111-222222222222',
      quantity: 5
    }

    const orderItem2 = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222224',
      order_ID: 'eeeeeeee-ffff-0000-1111-222222222222',
      quantity: 10
    }

    await POST(`/odata/v4/order/OrderItems`, orderItem1)
    await POST(`/odata/v4/order/OrderItems`, orderItem2)

    // Create OrderItemNotes (Level 3) for each OrderItem
    const note1ForItem1 = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222225',
      item_ID: 'eeeeeeee-ffff-0000-1111-222222222223',
      text: 'Note 1 for Item 1'
    }

    const note2ForItem1 = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222226',
      item_ID: 'eeeeeeee-ffff-0000-1111-222222222223',
      text: 'Note 2 for Item 1'
    }

    const note1ForItem2 = {
      ID: 'eeeeeeee-ffff-0000-1111-222222222227',
      item_ID: 'eeeeeeee-ffff-0000-1111-222222222224',
      text: 'Note 1 for Item 2'
    }

    await POST(`/odata/v4/order/OrderItemNotes`, note1ForItem1)
    await POST(`/odata/v4/order/OrderItemNotes`, note2ForItem1)
    await POST(`/odata/v4/order/OrderItemNotes`, note1ForItem2)

    // Verify all entities exist before deletion
    const { data: orderBefore } = await GET(`/odata/v4/order/Orders(eeeeeeee-ffff-0000-1111-222222222222)?$expand=items($expand=notes)`)
    expect(orderBefore.items).to.have.lengthOf(2)
    expect(orderBefore.items[0].notes).to.have.lengthOf(2)
    expect(orderBefore.items[1].notes).to.have.lengthOf(1)

    // Delete the parent Order (should cascade to OrderItems and OrderItemNotes)
    const deleteResponse = await DELETE(`/odata/v4/order/Orders(eeeeeeee-ffff-0000-1111-222222222222)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify Order is soft deleted
    const { data: deletedOrder } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20eeeeeeee-ffff-0000-1111-222222222222&$select=ID,isDeleted`)
    expect(deletedOrder.value).to.have.lengthOf(1)
    expect(deletedOrder.value[0].isDeleted).to.be.true

    // Verify OrderItems (Level 2) are soft deleted
    const { data: deletedItems } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20eeeeeeee-ffff-0000-1111-222222222222&$select=ID,isDeleted`)
    expect(deletedItems.value).to.have.lengthOf(2)
    const itemIDs = deletedItems.value.map(item => item.ID)
    expect(itemIDs).to.include('eeeeeeee-ffff-0000-1111-222222222223')
    expect(itemIDs).to.include('eeeeeeee-ffff-0000-1111-222222222224')

    // CRITICAL TEST: Verify OrderItemNotes (Level 3) are also soft deleted
    // This is where Critical Issue #3 would manifest - if cascade recursion passes wrong keys,
    // the notes will NOT be soft deleted
    const { data: deletedNotes } = await GET(`/odata/v4/order/OrderItemNotes?$filter=isDeleted%20eq%20true&$select=ID,text,isDeleted,item_ID`)

    // We should have 3 soft-deleted notes total
    const noteIDsForThisTest = deletedNotes.value.filter(note =>
      note.item_ID === 'eeeeeeee-ffff-0000-1111-222222222223' ||
      note.item_ID === 'eeeeeeee-ffff-0000-1111-222222222224'
    )

    expect(noteIDsForThisTest).to.have.lengthOf(3)
    const noteIDs = noteIDsForThisTest.map(note => note.ID)
    expect(noteIDs).to.include('eeeeeeee-ffff-0000-1111-222222222225')
    expect(noteIDs).to.include('eeeeeeee-ffff-0000-1111-222222222226')
    expect(noteIDs).to.include('eeeeeeee-ffff-0000-1111-222222222227')

    noteIDsForThisTest.forEach(note => {
      expect(note.isDeleted).to.be.true
    })

    // Verify notes are NOT returned in normal GET requests (auto-filtered)
    const { data: normalNotes } = await GET(`/odata/v4/order/OrderItemNotes?$filter=(item_ID%20eq%20eeeeeeee-ffff-0000-1111-222222222223%20or%20item_ID%20eq%20eeeeeeee-ffff-0000-1111-222222222224)`)
    expect(normalNotes.value).to.have.lengthOf(0)
  })

})
