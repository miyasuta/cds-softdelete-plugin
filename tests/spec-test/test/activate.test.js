const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('ドラフト有効化のテストケース', () => {

  describe('ACT-01: 新規ドラフト子を isDeleted=true にして有効化（アクティブ未作成）', () => {
    it('新規子が isDeleted=true の場合はアクティブに作成されない', async () => {
      const orderID = 'A100'
      const itemID = 'DI101'

      // 前提: アクティブ側: Orders('A100') のみ、子なし
      //       ドラフト: Orders_draft('D100')
      //       ドラフト子 DI101: isDeleted=true（一度も有効化していない新規子）
      //       アクティブ側に対応する子レコードは存在しない

      // 新規ドラフトを作成
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // ドラフト子を削除（isDeleted=true にする）
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 操作: POST /OrderService/Orders(ID='A100',IsActiveEntity=true)/OrderService.draftActivate
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // 期待結果: アクティブ側 OrderItems に DI101 に対応する子が作成されない
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)?$expand=items`)

      expect(data.items).to.have.lengthOf(0)
    })
  })

  describe('ACT-02: 既存子を isDeleted=true にして有効化（アクティブへ反映）', () => {
    it('既存子の isDeleted=true がアクティブへ反映される', async () => {
      const orderID = 'A200'
      const itemID = 'AI201'

      // 前提: アクティブ側: Orders('A200'), OrderItems('AI201': isDeleted=false)
      //       ドラフト側: Orders_draft('D200')
      //       ドラフト子 DI201: isDeleted=true（AI201 に対応）

      // アクティブエンティティを作成
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // ドラフトを有効化
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // ドラフト子を削除（isDeleted=true にする）
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 操作: POST /OrderService/Orders(ID='A200',IsActiveEntity=true)/OrderService.draftActivate
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // 期待結果: アクティブ OrderItems('AI201').isDeleted == true
      const { data: activeItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=true)`)
      expect(activeItem.isDeleted).to.be.true

      // 期待結果: アクティブ OrderItems('AI201').deletedAt / deletedBy も更新される
      expect(activeItem.deletedAt).to.not.be.null
      expect(activeItem.deletedBy).to.equal('alice')
    })
  })

})
