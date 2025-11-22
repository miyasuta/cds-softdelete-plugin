const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test (__dirname+'/..')
axios.defaults.auth = { username: 'alice', password: '' }

// ヘルパー関数: Order + Items セットアップ (deep insert)
async function setupOrderWithItems(orderID, item1ID, item2ID) {
  return await POST(`/odata/v4/order/Orders`, {
    ID: orderID,
    createdAt: new Date().toISOString(),
    total: 100.00,
    items: [
      { ID: item1ID, quantity: 5 },
      { ID: item2ID, quantity: 10 }
    ]
  })
}

// ヘルパー関数: Order + Items + Notes セットアップ (deep insert)
async function setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID) {
  return await POST(`/odata/v4/order/Orders`, {
    ID: orderID,
    createdAt: new Date().toISOString(),
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
}

describe('OrderService - Cascade Delete and Expand Tests', () => {

  describe('Direct child deletion', () => {

    it('should soft delete OrderItem when deleted directly', async () => {
      const orderID = '12345678-1234-1234-1234-123456789001'
      const item1ID = '87654321-4321-4321-4321-cba987654001'
      const item2ID = '11111111-2222-3333-4444-555555555001'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/OrderItems(${item1ID})`)

      const { data } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${item1ID}`)

      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0]).to.containSubset({ ID: item1ID, quantity: 5, isDeleted: true })
    })

    it('should exclude deleted item from $expand on parent', async () => {
      const orderID = '12345678-1234-1234-1234-123456789002'
      const item1ID = '87654321-4321-4321-4321-cba987654002'
      const item2ID = '11111111-2222-3333-4444-555555555002'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/OrderItems(${item1ID})`)

      const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items`)

      expect(data.items).to.have.lengthOf(1)
      expect(data.items[0].ID).to.equal(item2ID)
    })

    it('should exclude deleted item from list queries without filter', async () => {
      const orderID = '12345678-1234-1234-1234-123456789003'
      const item1ID = '87654321-4321-4321-4321-cba987654003'
      const item2ID = '11111111-2222-3333-4444-555555555003'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/OrderItems(${item1ID})`)

      const { data } = await GET(`/odata/v4/order/OrderItems`)
      const deletedItem = data.value.find(item => item.ID === item1ID)

      expect(deletedItem).to.be.undefined
    })

    it('should exclude deleted item from list queries with $filter by key', async () => {
      const orderID = '12345678-1234-1234-1234-123456789004'
      const item1ID = '87654321-4321-4321-4321-cba987654004'
      const item2ID = '11111111-2222-3333-4444-555555555004'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/OrderItems(${item1ID})`)

      const { data } = await GET(`/odata/v4/order/OrderItems?$filter=ID%20eq%20${item1ID}`)

      expect(data.value).to.have.lengthOf(0)
    })
  })

  describe('2-level cascade deletion (Order -> OrderItems)', () => {

    it('should soft delete parent Order', async () => {
      const orderID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01'
      const item1ID = 'item1111-1111-1111-1111-111111111101'
      const item2ID = 'item2222-2222-2222-2222-222222222201'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)

      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].isDeleted).to.be.true
    })

    it('should exclude deleted Order from list queries', async () => {
      const orderID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02'
      const item1ID = 'item1111-1111-1111-1111-111111111102'
      const item2ID = 'item2222-2222-2222-2222-222222222202'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/Orders`)
      const deletedOrder = data.value.find(o => o.ID === orderID)

      expect(deletedOrder).to.be.undefined
    })

    it('should exclude deleted Order from list queries with $filter by key', async () => {
      const orderID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03'
      const item1ID = 'item1111-1111-1111-1111-111111111103'
      const item2ID = 'item2222-2222-2222-2222-222222222203'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/Orders?$filter=ID%20eq%20${orderID}`)

      expect(data.value).to.have.lengthOf(0)
    })

    it('should cascade soft delete to all OrderItems', async () => {
      const orderID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee04'
      const item1ID = 'item1111-1111-1111-1111-111111111104'
      const item2ID = 'item2222-2222-2222-2222-222222222204'

      await setupOrderWithItems(orderID, item1ID, item2ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${orderID}`)

      expect(data.value).to.have.lengthOf(2)
      const itemIDs = data.value.map(item => item.ID)
      expect(itemIDs).to.include(item1ID)
      expect(itemIDs).to.include(item2ID)
    })
  })

  describe('3-level cascade deletion (Order -> OrderItems -> OrderItemNotes)', () => {

    it('should have correct structure before deletion', async () => {
      const orderID = 'eeeeeeee-ffff-0000-1111-222222222222'
      const item1ID = 'eeeeeeee-ffff-0000-1111-222222222223'
      const item2ID = 'eeeeeeee-ffff-0000-1111-222222222224'
      const note1ID = 'eeeeeeee-ffff-0000-1111-222222222225'
      const note2ID = 'eeeeeeee-ffff-0000-1111-222222222226'
      const note3ID = 'eeeeeeee-ffff-0000-1111-222222222227'

      await setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)

      const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items($expand=notes)`)

      expect(data.items).to.have.lengthOf(2)
      expect(data.items[0].notes).to.have.lengthOf(2)
      expect(data.items[1].notes).to.have.lengthOf(1)
    })

    it('should cascade delete Level 1 (Order)', async () => {
      const orderID = 'eeeeeeee-ffff-0000-1111-222222222232'
      const item1ID = 'eeeeeeee-ffff-0000-1111-222222222233'
      const item2ID = 'eeeeeeee-ffff-0000-1111-222222222234'
      const note1ID = 'eeeeeeee-ffff-0000-1111-222222222235'
      const note2ID = 'eeeeeeee-ffff-0000-1111-222222222236'
      const note3ID = 'eeeeeeee-ffff-0000-1111-222222222237'

      await setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}`)
      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].isDeleted).to.be.true
    })

    it('should cascade delete Level 2 (OrderItems)', async () => {
      const orderID = 'eeeeeeee-ffff-0000-1111-222222222242'
      const item1ID = 'eeeeeeee-ffff-0000-1111-222222222243'
      const item2ID = 'eeeeeeee-ffff-0000-1111-222222222244'
      const note1ID = 'eeeeeeee-ffff-0000-1111-222222222245'
      const note2ID = 'eeeeeeee-ffff-0000-1111-222222222246'
      const note3ID = 'eeeeeeee-ffff-0000-1111-222222222247'

      await setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/OrderItems?$filter=isDeleted%20eq%20true%20and%20order_ID%20eq%20${orderID}`)
      expect(data.value).to.have.lengthOf(2)
      const itemIDs = data.value.map(item => item.ID)
      expect(itemIDs).to.include(item1ID)
      expect(itemIDs).to.include(item2ID)
    })

    it('should cascade delete Level 3 (OrderItemNotes)', async () => {
      const orderID = 'eeeeeeee-ffff-0000-1111-222222222252'
      const item1ID = 'eeeeeeee-ffff-0000-1111-222222222253'
      const item2ID = 'eeeeeeee-ffff-0000-1111-222222222254'
      const note1ID = 'eeeeeeee-ffff-0000-1111-222222222255'
      const note2ID = 'eeeeeeee-ffff-0000-1111-222222222256'
      const note3ID = 'eeeeeeee-ffff-0000-1111-222222222257'

      await setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)
      await DELETE(`/odata/v4/order/Orders(${orderID})`)

      const { data } = await GET(`/odata/v4/order/OrderItemNotes?$filter=isDeleted%20eq%20true`)
      const testNotes = data.value.filter(note => [note1ID, note2ID, note3ID].includes(note.ID))
      expect(testNotes).to.have.lengthOf(3)
      testNotes.forEach(note => expect(note.isDeleted).to.be.true)
    })
  })

  describe('$expand with isDeleted filters', () => {
    describe('Scenario 1: $expand on soft-deleted parent', () => {

      it('should include deleted items when expanding on deleted parent', async () => {
        const orderID = 'cccccccc-dddd-eeee-ffff-000000000001'
        const item1ID = 'cccccccc-dddd-eeee-ffff-000000000011'
        const item2ID = 'cccccccc-dddd-eeee-ffff-000000000012'

        await setupOrderWithItems(orderID, item1ID, item2ID)
        await DELETE(`/odata/v4/order/Orders(${orderID})`)

        const { data } = await GET(`/odata/v4/order/Orders?$filter=isDeleted%20eq%20true%20and%20ID%20eq%20${orderID}&$expand=items`)

        expect(data.value).to.have.lengthOf(1)
        expect(data.value[0].isDeleted).to.be.true
        expect(data.value[0].items).to.have.lengthOf(2)
        data.value[0].items.forEach(item => {
          expect(item.isDeleted).to.be.true
          expect(item.deletedBy).to.equal('alice')
        })
      })

      it('should include deleted items when accessing deleted parent by key (Object Page scenario)', async () => {
        const orderID = 'cccccccc-dddd-eeee-ffff-000000000002'
        const item1ID = 'cccccccc-dddd-eeee-ffff-000000000013'
        const item2ID = 'cccccccc-dddd-eeee-ffff-000000000014'

        await setupOrderWithItems(orderID, item1ID, item2ID)
        await DELETE(`/odata/v4/order/Orders(${orderID})`)

        // Key-based access (Object Page) - should show deleted items for deleted parent
        const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items`)

        expect(data.isDeleted).to.be.true
        expect(data.items).to.have.lengthOf(2)
        data.items.forEach(item => {
          expect(item.isDeleted).to.be.true
          expect(item.deletedBy).to.equal('alice')
        })
      })

      it('should include deleted notes in nested expand when accessing deleted parent by key', async () => {
        const orderID = 'cccccccc-dddd-eeee-ffff-000000000003'
        const item1ID = 'cccccccc-dddd-eeee-ffff-000000000015'
        const item2ID = 'cccccccc-dddd-eeee-ffff-000000000016'
        const note1ID = 'cccccccc-dddd-eeee-ffff-000000000017'
        const note2ID = 'cccccccc-dddd-eeee-ffff-000000000018'
        const note3ID = 'cccccccc-dddd-eeee-ffff-000000000019'

        await setupOrderWithItemsAndNotes(orderID, item1ID, item2ID, note1ID, note2ID, note3ID)
        await DELETE(`/odata/v4/order/Orders(${orderID})`)

        // Key-based access with nested expand - should show all deleted items and notes
        const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items($expand=notes)`)

        expect(data.isDeleted).to.be.true
        expect(data.items).to.have.lengthOf(2)

        const item1 = data.items.find(i => i.ID === item1ID)
        const item2 = data.items.find(i => i.ID === item2ID)

        expect(item1.isDeleted).to.be.true
        expect(item1.notes).to.have.lengthOf(2)
        item1.notes.forEach(note => expect(note.isDeleted).to.be.true)

        expect(item2.isDeleted).to.be.true
        expect(item2.notes).to.have.lengthOf(1)
        item2.notes.forEach(note => expect(note.isDeleted).to.be.true)
      })

      it('should exclude deleted items from active orders', async () => {
        const orderID = 'cccccccc-dddd-eeee-ffff-000000000021'
        const item1ID = 'cccccccc-dddd-eeee-ffff-000000000022'
        const item2ID = 'cccccccc-dddd-eeee-ffff-000000000023'

        await setupOrderWithItems(orderID, item1ID, item2ID)
        await DELETE(`/odata/v4/order/Orders(${orderID})`)

        const { data } = await GET(`/odata/v4/order/Orders?$expand=items`)

        data.value.forEach(order => {
          order.items.forEach(item => {
            expect([item1ID, item2ID]).to.not.include(item.ID)
          })
        })
      })
    })

    describe('Scenario 2: Explicit isDeleted filters in $expand', () => {

      it('should show only deleted items with $expand and isDeleted=true filter', async () => {
        const orderID = 'dddddddd-eeee-ffff-0000-000000000001'
        const item3ID = 'dddddddd-eeee-ffff-0000-000000000011'
        const item4ID = 'dddddddd-eeee-ffff-0000-000000000012'

        await setupOrderWithItems(orderID, item3ID, item4ID)
        await DELETE(`/odata/v4/order/OrderItems(${item3ID})`)

        const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items($filter=isDeleted%20eq%20true)`)

        expect(data.items).to.have.lengthOf(1)
        expect(data.items[0].ID).to.equal(item3ID)
        expect(data.items[0].isDeleted).to.be.true
      })

      it('should show only active items with $expand and isDeleted=false filter', async () => {
        const orderID = 'dddddddd-eeee-ffff-0000-000000000021'
        const item3ID = 'dddddddd-eeee-ffff-0000-000000000031'
        const item4ID = 'dddddddd-eeee-ffff-0000-000000000032'

        await setupOrderWithItems(orderID, item3ID, item4ID)
        await DELETE(`/odata/v4/order/OrderItems(${item3ID})`)

        const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items($filter=isDeleted%20eq%20false)`)

        expect(data.items).to.have.lengthOf(1)
        expect(data.items[0].ID).to.equal(item4ID)
        expect(data.items[0].isDeleted).to.be.false
      })

      it('should show only active items with default $expand', async () => {
        const orderID = 'dddddddd-eeee-ffff-0000-000000000041'
        const item3ID = 'dddddddd-eeee-ffff-0000-000000000051'
        const item4ID = 'dddddddd-eeee-ffff-0000-000000000052'

        await setupOrderWithItems(orderID, item3ID, item4ID)
        await DELETE(`/odata/v4/order/OrderItems(${item3ID})`)

        const { data } = await GET(`/odata/v4/order/Orders(${orderID})?$expand=items`)

        expect(data.items).to.have.lengthOf(1)
        expect(data.items[0].ID).to.equal(item4ID)
      })
    })
  })

})
