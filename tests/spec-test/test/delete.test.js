const cds = require('@sap/cds')

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..')
axios.defaults.auth = { username: 'alice', password: '' }

describe('削除時のテストケース', () => {

  describe('DEL-01: アクティブルートの論理削除', () => {
    it('キー指定 DELETE によりアクティブルートが isDeleted=true になること', async () => {
      const orderID = 'O1'

      // 前提: Orders('O1'): isDeleted=false, IsActiveEntity=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 100.00
      })

      // 操作: DELETE /OrderService/Orders('O1')
      const deleteRes = await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // 期待結果: HTTP 204
      expect(deleteRes.status).to.equal(204)

      // 期待結果: Orders('O1').isDeleted == true
      const { data } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(data.isDeleted).to.be.true

      // 期待結果: deletedAt / deletedBy が更新される
      expect(data.deletedAt).to.not.be.null
      expect(data.deletedBy).to.equal('alice')

      // 期待結果: 物理削除されない（レコードが取得できる）
      expect(data.ID).to.equal(orderID)
    })
  })

  describe('DEL-02: ルート削除による Composition 子カスケード', () => {
    it('親 DELETE により全 Composition 階層が論理削除されること', async () => {
      const orderID = 'O2'
      const item1ID = 'I21'
      const item2ID = 'I22'

      // 前提: Orders('O2'): isDeleted=false
      //       OrderItems('I21', parent='O2'): isDeleted=false
      //       OrderItems('I22', parent='O2'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 200.00,
        items: [
          { ID: item1ID, quantity: 5 },
          { ID: item2ID, quantity: 10 }
        ]
      })

      // 操作: DELETE /OrderService/Orders('O2')
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // 期待結果: 親 O2 が isDeleted=true
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.true

      // 期待結果: 子 I21 / I22 も isDeleted=true
      const { data: item1 } = await GET(`/odata/v4/order/OrderItems('${item1ID}')`)
      expect(item1.isDeleted).to.be.true

      const { data: item2 } = await GET(`/odata/v4/order/OrderItems('${item2ID}')`)
      expect(item2.isDeleted).to.be.true

      // 期待結果: 子 I21 / I22 の deletedAt / deletedBy も更新される
      expect(item1.deletedAt).to.not.be.null
      expect(item1.deletedBy).to.equal('alice')
      expect(item2.deletedAt).to.not.be.null
      expect(item2.deletedBy).to.equal('alice')
    })
  })

  describe('DEL-03: アクティブ子の個別 DELETE', () => {
    it('子 DELETE により子のみ論理削除され、親は未変更であること', async () => {
      const orderID = 'O3'
      const itemID = 'I31'

      // 前提: Orders('O3'): isDeleted=false
      //       OrderItems('I31'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 300.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // 操作: DELETE /OrderService/OrderItems('I31')
      await DELETE(`/odata/v4/order/OrderItems('${itemID}')`)

      // 期待結果: Orders('O3').isDeleted は false のまま
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.false

      // 期待結果: OrderItems('I31').isDeleted == true
      const { data: item } = await GET(`/odata/v4/order/OrderItems('${itemID}')`)
      expect(item.isDeleted).to.be.true
    })
  })

  describe('DEL-03-extended: 子削除による孫カスケード', () => {
    it('子を削除したとき、配下の孫以降もすべてカスケード削除されること', async () => {
      const orderID = 'O3B'
      const itemID = 'I31B'
      const detailID = 'D311B'

      // 前提: Orders('O3B'): isDeleted=false
      //       OrderItems('I31B'): isDeleted=false
      //       ItemDetails('D311B', parent='I31B'): isDeleted=false
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 300.00,
        items: [
          {
            ID: itemID,
            quantity: 5,
            details: [
              { ID: detailID, text: 'Detail 1' }
            ]
          }
        ]
      })

      // 操作: DELETE /OrderService/OrderItems('I31B')
      await DELETE(`/odata/v4/order/OrderItems('${itemID}')`)

      // 期待結果: Orders('O3B').isDeleted は false のまま
      const { data: order } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(order.isDeleted).to.be.false

      // 期待結果: OrderItems('I31B').isDeleted == true
      const { data: item } = await GET(`/odata/v4/order/OrderItems('${itemID}')`)
      expect(item.isDeleted).to.be.true

      // 期待結果: ItemDetails('D311B').isDeleted == true (孫もカスケード)
      const { data: detail } = await GET(`/odata/v4/order/ItemDetails('${detailID}')`)
      expect(detail.isDeleted).to.be.true

      // 期待結果: ItemDetails('D311B').deletedAt / deletedBy も更新される
      expect(detail.deletedAt).to.not.be.null
      expect(detail.deletedBy).to.equal('alice')
    })
  })

  describe('DEL-04: ドラフト破棄時は物理削除', () => {
    it('ドラフト破棄でドラフト行が物理削除され、論理削除されないこと', async () => {
      const orderID = 'OD4'
      const itemID = 'ID41'

      // 前提: Orders_draft('OD4'): isDeleted=false, IsActiveEntity=false
      //       OrderItems_draft('ID41'): isDeleted=false

      // 新規ドラフトを作成（deep insert）
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 400.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // 操作: DELETE /OrderService/Orders(ID='OD4',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)

      // 期待結果: Orders_draft('OD4') が物理削除されている（取得できない）
      try {
        await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)`)
        expect.fail('Draft order should be physically deleted')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }

      // 期待結果: OrderItems_draft('ID41') も物理削除されている
      try {
        await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
        expect.fail('Draft item should be physically deleted')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }

      // 期待結果: アクティブ側に影響なし（新規ドラフトなのでアクティブは存在しない）
      try {
        await GET(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)`)
        expect.fail('Active order should not exist for new draft')
      } catch (error) {
        expect(error.response.status).to.equal(404)
      }
    })
  })

  describe('DEL-05: ドラフト子削除（isDeleted=true）', () => {
    it('ドラフト編集中に削除した子に isDeleted=true が設定されること', async () => {
      const orderID = 'O5'
      const itemID = 'I51'

      // 前提: Orders('O5'), OrderItems('I51') はアクティブ
      // ドラフトを作成して有効化
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 500.00,
        items: [
          { ID: itemID, quantity: 5 }
        ]
      })

      // ドラフトを有効化してアクティブにする
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブエンティティを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // 操作: DELETE /OrderService/OrderItems(ID='ID51',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 期待結果: OrderItems_draft('ID51').isDeleted == true
      const { data: draftItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
      expect(draftItem.isDeleted).to.be.true

      // 期待結果: OrderItems_draft('ID51').deletedAt / deletedBy が更新される
      expect(draftItem.deletedAt).to.not.be.null
      expect(draftItem.deletedBy).to.equal('alice')

      // 期待結果: アクティブ側はまだ削除されない
      const { data: activeItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=true)`)
      expect(activeItem.isDeleted).to.be.false
    })
  })

  describe('DEL-05-extended: ドラフト子削除による孫カスケード', () => {
    it('ドラフトで子を削除したとき、孫もカスケードで isDeleted=true になること', async () => {
      const orderID = 'OD5B'
      const itemID = 'ID51B'
      const detailID = 'D511B'

      // 前提: Orders_draft('OD5B'), OrderItems_draft('ID51B'), ItemDetails_draft('D511B') が存在
      // ドラフトを作成して有効化
      await POST(`/odata/v4/order-draft/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 500.00,
        items: [
          {
            ID: itemID,
            quantity: 5,
            details: [
              { ID: detailID, text: 'Detail 1' }
            ]
          }
        ]
      })

      // ドラフトを有効化してアクティブにする
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=false)/OrderDraftService.draftActivate`)

      // アクティブエンティティを再度ドラフト編集
      await POST(`/odata/v4/order-draft/Orders(ID='${orderID}',IsActiveEntity=true)/OrderDraftService.draftEdit`, {
        PreserveChanges: true
      })

      // 操作: DELETE /OrderService/OrderItems(ID='ID51B',IsActiveEntity=false)
      await DELETE(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)

      // 期待結果: OrderItems_draft('ID51B').isDeleted == true
      const { data: draftItem } = await GET(`/odata/v4/order-draft/OrderItems(ID='${itemID}',IsActiveEntity=false)`)
      expect(draftItem.isDeleted).to.be.true

      // 期待結果: ItemDetails_draft('D511B').isDeleted == true (孫もカスケード)
      const { data: draftDetail } = await GET(`/odata/v4/order-draft/ItemDetails(ID='${detailID}',IsActiveEntity=false)`)
      expect(draftDetail.isDeleted).to.be.true

      // 期待結果: ItemDetails_draft('D511B').deletedAt / deletedBy も更新される
      expect(draftDetail.deletedAt).to.not.be.null
      expect(draftDetail.deletedBy).to.equal('alice')
    })
  })

  describe.skip('DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）', () => {
    // TODO: プラグインに冪等性チェックを実装後に有効化
    it('すでに isDeleted=true のレコードに対する DELETE が成功し、副作用がないこと', async () => {
      const orderID = 'O6'

      // 前提: Orders('O6'): isDeleted=true
      await POST(`/odata/v4/order/Orders`, {
        ID: orderID,
        createdAt: new Date().toISOString(),
        total: 600.00
      })

      // 1回目の削除
      await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // 削除後の状態を取得
      const { data: firstDelete } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      const firstDeletedAt = firstDelete.deletedAt
      const firstDeletedBy = firstDelete.deletedBy

      // 操作: DELETE /OrderService/Orders('O6') (2回目)
      const deleteRes = await DELETE(`/odata/v4/order/Orders('${orderID}')`)

      // 期待結果: HTTP 204
      expect(deleteRes.status).to.equal(204)

      // 期待結果: isDeleted / deletedAt / deletedBy は変更されない
      const { data: secondDelete } = await GET(`/odata/v4/order/Orders('${orderID}')`)
      expect(secondDelete.isDeleted).to.be.true
      expect(secondDelete.deletedAt).to.equal(firstDeletedAt)
      expect(secondDelete.deletedBy).to.equal(firstDeletedBy)
    })
  })

})
