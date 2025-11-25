const cds = require('@sap/cds')

module.exports = class OrderDraftService extends cds.ApplicationService { init() {

  const { Orders, OrderItems, OrderItemNotes } = cds.entities('OrderDraftService')

  // this.on('DELETE', OrderItems.drafts, async (req) => {
  //   const result = await UPDATE(OrderItems.drafts).set({ isDeleted: true }).where({ ID: req.data.ID })
  //   console.log('On DELETE OrderItems.drafts - marked as deleted', req.data)
  //   console.log('Update result:', result)
  // })  


  return super.init()
}}
