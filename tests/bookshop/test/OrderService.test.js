const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('OrderService - Soft Delete Tests for Child Entity', () => {

  it('should create Order with OrderItems, delete OrderItem, and verify soft delete behavior', async () => {
    // Create a new Order
    const newOrder = {
      ID: '12345678-1234-1234-1234-123456789abc',
      createdAt: new Date().toISOString(),
      total: 100.00,
      items: []
    }

    const createOrderResponse = await POST(`/odata/v4/order/Orders`, newOrder)
    expect(createOrderResponse.status).to.equal(201)
    expect(createOrderResponse.data).to.containSubset({
      ID: '12345678-1234-1234-1234-123456789abc'
    })

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

    const createItemResponse1 = await POST(`/odata/v4/order/OrderItems`, orderItem1)
    expect(createItemResponse1.status).to.equal(201)
    expect(createItemResponse1.data).to.containSubset({
      ID: '87654321-4321-4321-4321-cba987654321',
      quantity: 5
    })

    const createItemResponse2 = await POST(`/odata/v4/order/OrderItems`, orderItem2)
    expect(createItemResponse2.status).to.equal(201)
    expect(createItemResponse2.data).to.containSubset({
      ID: '11111111-2222-3333-4444-555555555555',
      quantity: 10
    })

    // Verify both items are returned before deletion with $expand
    const { data: orderWithItemsBefore } = await GET(`/odata/v4/order/Orders(12345678-1234-1234-1234-123456789abc)?$expand=items`)
    expect(orderWithItemsBefore.items).to.have.lengthOf(2)

    // Delete the first OrderItem
    const deleteResponse = await DELETE(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`)
    expect(deleteResponse.status).to.equal(204)

    // Verify only the non-deleted OrderItem is returned when expanding Order
    const { data: orderWithItemsAfter } = await GET(`/odata/v4/order/Orders(12345678-1234-1234-1234-123456789abc)?$expand=items`)
    expect(orderWithItemsAfter.items).to.have.lengthOf(1)
    expect(orderWithItemsAfter.items[0]).to.containSubset({
      ID: '11111111-2222-3333-4444-555555555555',
      quantity: 10
    })

    // Verify it's NOT returned with normal GET request
    let normalGetFailed = false
    try {
      await GET(`/odata/v4/order/OrderItems(87654321-4321-4321-4321-cba987654321)`, {
        params: { $select: 'ID,quantity' }
      })
    } catch (error) {
      normalGetFailed = error.response.status === 404
    }
    expect(normalGetFailed).to.be.true

    // Verify it CAN be retrieved when filtering with isDeleted=true
    const { data: deletedGet } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%2087654321-4321-4321-4321-cba987654321&$select=ID,quantity,isDeleted`)
    expect(deletedGet.value).to.have.lengthOf(1)
    expect(deletedGet.value[0]).to.containSubset({
      ID: '87654321-4321-4321-4321-cba987654321',
      quantity: 5,
      isDeleted: true
    })
  })

})
