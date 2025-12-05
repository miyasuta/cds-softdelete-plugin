const cds = require('@sap/cds')

const { GET, POST, PATCH, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('Field protection test cases', () => {

  describe('PROT-01: isDeleted specified in CREATE is ignored', () => {
    it('@readonly annotation causes isDeleted value in CREATE to be ignored', async () => {
      // Purpose: Verify that isDeleted value specified in CREATE is ignored due to @readonly
      // Prerequisite:
      //   - Orders entity has softdelete aspect applied
      // Operation:
      //   - POST /OrderService/Orders with body: {"ID": "P1", "isDeleted": true}
      // Expected result:
      //   - Record is created
      //   - Orders('P1').isDeleted == false (default value is used)
      //   - Request body isDeleted=true is ignored

      const orderID = 'P1'

      // Operation: Create order with isDeleted=true in request body
      const createRes = await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        isDeleted: true  // This should be ignored
      })

      // Expected result: Record is created successfully
      expect(createRes.status).to.equal(201)

      // Expected result: isDeleted is false (default value), not true from request
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(data.isDeleted).to.be.false
      expect(data.ID).to.equal(orderID)
    })
  })

  describe('PROT-02: isDeleted update in UPDATE is ignored', () => {
    it('@readonly annotation prevents isDeleted value from being changed via UPDATE', async () => {
      // Purpose: Verify that isDeleted value cannot be changed via UPDATE
      // Prerequisite:
      //   - Orders('P2'): isDeleted=false
      // Operation:
      //   - PUT /OrderService/Orders('P2') with body: {"ID": "P2", "isDeleted": true}
      // Expected result:
      //   - Orders('P2').isDeleted remains false (not changed)
      //   - Request body isDeleted=true is ignored
      //   - No error occurs

      const orderID = 'P2'

      // Prerequisite: Create order with isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00
      })

      // Verify initial state
      let response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.isDeleted).to.be.false

      // Operation: Attempt to update isDeleted to true
      const updateRes = await axios.put(`/odata/v4/order/Orders('${orderID}')`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00,
        isDeleted: true  // This should be ignored
      })

      // Expected result: Request succeeds (no error)
      expect(updateRes.status).to.equal(200)

      // Expected result: isDeleted remains false
      response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.isDeleted).to.be.false
    })
  })

  describe('PROT-03: deletedAt update in PATCH is ignored', () => {
    it('@readonly annotation prevents deletedAt value from being changed via PATCH', async () => {
      // Purpose: Verify that deletedAt value cannot be changed via PATCH
      // Prerequisite:
      //   - Orders('P3'): deletedAt=null
      // Operation:
      //   - PATCH /OrderService/Orders('P3') with body: {"deletedAt": "2025-01-01T00:00:00Z"}
      // Expected result:
      //   - Orders('P3').deletedAt remains null (not changed)
      //   - Request body deletedAt is ignored
      //   - No error occurs

      const orderID = 'P3'

      // Prerequisite: Create order with deletedAt=null
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 300.00
      })

      // Verify initial state
      let response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.deletedAt).to.be.null

      // Operation: Attempt to update deletedAt
      const patchRes = await PATCH(`/odata/v4/order/Orders('${orderID}')`, {
        deletedAt: '2025-01-01T00:00:00Z'  // This should be ignored
      })

      // Expected result: Request succeeds (no error)
      expect(patchRes.status).to.equal(200)

      // Expected result: deletedAt remains null
      response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.deletedAt).to.be.null
    })
  })

  describe('PROT-04: deletedBy update in PATCH is ignored', () => {
    it('@readonly annotation prevents deletedBy value from being changed via PATCH', async () => {
      // Purpose: Verify that deletedBy value cannot be changed via PATCH
      // Prerequisite:
      //   - Orders('P4'): deletedBy=null
      // Operation:
      //   - PATCH /OrderService/Orders('P4') with body: {"deletedBy": "user123"}
      // Expected result:
      //   - Orders('P4').deletedBy remains null (not changed)
      //   - Request body deletedBy is ignored
      //   - No error occurs

      const orderID = 'P4'

      // Prerequisite: Create order with deletedBy=null
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 400.00
      })

      // Verify initial state
      let response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.deletedBy).to.be.null

      // Operation: Attempt to update deletedBy
      const patchRes = await PATCH(`/odata/v4/order/Orders('${orderID}')`, {
        deletedBy: 'user123'  // This should be ignored
      })

      // Expected result: Request succeeds (no error)
      expect(patchRes.status).to.equal(200)

      // Expected result: deletedBy remains null
      response = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(response.data.deletedBy).to.be.null
    })
  })

})
