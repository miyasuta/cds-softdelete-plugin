const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('OrderService - Soft Delete Tests for Child Entity', () => {

  it('should physically delete OrderItem when deleted directly (no @softdelete.enabled on child)', async () => {
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

    // Delete the first OrderItem directly (should be physical delete, not soft delete)
    const deleteResponse = await DELETE(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify only one item remains
    const { data: orderAfter } = await GET(`/odata/v4/order/Orders(12345678-1234-1234-1234-123456789abc)?$expand=items`)
    expect(orderAfter.items).to.have.lengthOf(1)
    expect(orderAfter.items[0]).to.containSubset({
      ID: '11111111-2222-3333-4444-555555555555'
    })

    // Verify deleted item is NOT found (physical delete)
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`)
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CANNOT be retrieved even with isDeleted=true filter (because it was physically deleted)
    const { data: deletedGet } = await GET(`/odata/v4/order/OrderItems?$filter=ID%20eq%2087654321-4321-4321-4321-cba987654321`)
    expect(deletedGet.value).to.have.lengthOf(0)
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

    // NOTE: When querying OrderItems directly (not through parent), soft-deleted items ARE returned
    // because OrderItems doesn't have @softdelete.enabled (only parent Orders has it)
    // Soft delete filtering only applies when querying through the parent entity or with explicit isDeleted filter
    const { data: normalItems } = await GET(`/odata/v4/order/OrderItems?$filter=order_ID%20eq%20aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&$select=ID,quantity,isDeleted`)
    expect(normalItems.value).to.have.lengthOf(2)
    // But they are marked as deleted
    normalItems.value.forEach(item => {
      expect(item.isDeleted).to.be.true
    })
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

})
