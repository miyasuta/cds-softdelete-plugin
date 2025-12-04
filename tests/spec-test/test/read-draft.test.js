const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('ドラフト照会のテストケース', () => {

  describe('READ-D-01: ドラフトルート一覧（未削除のみ）', () => {
    it('R1 により isDeleted=false のドラフトのみ返る', async () => {
      const orderID = 'D1'

      // 前提: D1: isDeleted=false
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // 操作: GET /OrderService/Orders_draft?$filter=IsActiveEntity eq false
      const { data } = await GET(`/odata/v4/order-draft/Orders?$filter=IsActiveEntity eq false`)

      // 期待結果: D1 が返る
      const d1 = data.value.find(o => o.ID === orderID)
      expect(d1).to.not.be.undefined
      expect(d1.isDeleted).to.be.false
      expect(d1.IsActiveEntity).to.be.false
    })
  })

  describe('READ-D-02: ドラフトルート + isDeleted=true フィルタ（該当なし）', () => {
    it('仕様上ドラフトルートは論理削除されない', async () => {
      const orderID = 'D2'

      // ドラフトを作成
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // 操作: GET /OrderService/Orders_draft?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order-draft/Orders?$filter=isDeleted eq true`)

      // 期待結果: 空配列（このテストで作成したドラフトは該当しない）
      const result = data.value.filter(o => o.ID === orderID)
      expect(result).to.have.lengthOf(0)
    })
  })

  describe('READ-D-03: ドラフトルートキー指定（未削除）', () => {
    it('ドラフトルートをキー指定で取得できる', async () => {
      const orderID = 'D3'

      // 前提
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // 操作: GET /OrderService/Orders_draft('D3')
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)

      // 期待結果: D3 が返る
      expect(data.ID).to.equal(orderID)
      expect(data.IsActiveEntity).to.be.false
    })
  })

  describe('READ-D-04: ドラフト子一覧（削除済も含む）', () => {
    it('ドラフト子一覧では isDeleted=true も返る（ドラフト編集中の削除を確認可能）', async () => {
      const orderID = 'D4'
      const item1ID = 'DI41'
      const item2ID = 'DI42'

      // 前提: DI41: false, DI42: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // ドラフトを有効化
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // DI42を削除
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // 操作: /OrderItems_draft?$filter=IsActiveEntity eq false
      const { data } = await GET(`/odata/v4/order-draft/OrderItems?$filter=IsActiveEntity eq false`)

      // 期待結果: DI41, DI42 の両方が返る（削除済も含む）
      const result = data.value.filter(i => [item1ID, item2ID].includes(i.ID))
      expect(result).to.have.lengthOf(2)

      const item1 = result.find(i => i.ID === item1ID)
      const item2 = result.find(i => i.ID === item2ID)

      expect(item1.isDeleted).to.be.false
      expect(item2.isDeleted).to.be.true
    })
  })

  describe('READ-D-05: ドラフト子キー指定（削除済でも返る）', () => {
    it('ドラフト子キー指定で削除済も返る', async () => {
      const orderID = 'D6'
      const itemID = 'DI6'

      // 前提: DI6: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
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

      // DI6を削除
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 操作: /OrderItems_draft('DI6')
      const { data } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 期待結果: DI6 が返る
      expect(data.ID).to.equal(itemID)
      expect(data.isDeleted).to.be.true
    })
  })

  describe('READ-D-06: 親ドラフト未削除 + $expand（削除済子も含む）', () => {
    it('親ドラフト未削除の $expand でも削除済子が含まれる（ドラフト編集中の削除を確認可能）', async () => {
      const orderID = 'D7'
      const item1ID = 'DI71'
      const item2ID = 'DI72'

      // 前提: D7: false, DI71: false, DI72: true
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // ドラフトを有効化
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // DI72を削除
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // 操作: /Orders_draft('D7')?$expand=items
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)?$expand=items`)

      // 期待結果: items には DI71, DI72 の両方が含まれる（削除済も含む）
      expect(data.items).to.have.lengthOf(2)

      const item1 = data.items.find(i => i.ID === item1ID)
      const item2 = data.items.find(i => i.ID === item2ID)

      expect(item1.isDeleted).to.be.false
      expect(item2.isDeleted).to.be.true
    })
  })

  describe('READ-D-07: 親ドラフト未削除 + Navigation + isDeleted=true', () => {
    it('Navigation + フィルタで削除済のみ返す', async () => {
      const orderID = 'D8'
      const item1ID = 'DI81'
      const item2ID = 'DI82'

      // 前提
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // ドラフトを有効化
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // DI82を削除
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${item2ID}',IsActiveEntity=false)`)

      // 操作: /Orders_draft('D8')/items?$filter=isDeleted eq true
      const { data } = await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/items?$filter=isDeleted eq true`)

      // 期待結果: DI82 のみ返る
      expect(data.value).to.have.lengthOf(1)
      expect(data.value[0].ID).to.equal(item2ID)
    })
  })

})
