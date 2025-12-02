# Soft Delete Plugin — Test Specification
（updated spec based on 2025-02 version）

本ドキュメントは、最新版仕様に基づいて作成したテストケース一覧である。  
すべて箇条書きのみで記述し、表形式は使用しない。

---

# 1. 削除時のテストケース（DEL-xx）

## DEL-01: アクティブルートの論理削除
- 目的: キー指定 DELETE によりアクティブルートが `isDeleted=true` になること
- 前提:
  - Orders('O1'): isDeleted=false, IsActiveEntity=true
- 操作:
  - `DELETE /OrderService/Orders('O1')`
- 期待結果:
  - Orders('O1').isDeleted == true
  - deletedAt / deletedBy が更新される
  - 物理削除されない
  - HTTP 204

---

## DEL-02: ルート削除による Composition 子カスケード
- 目的: 親 DELETE により全 Composition 階層が論理削除されること
- 前提:
  - Orders('O2'): isDeleted=false
  - OrderItems('I21', parent='O2'): isDeleted=false
  - OrderItems('I22', parent='O2'): isDeleted=false
- 操作:
  - `DELETE /OrderService/Orders('O2')`
- 期待結果:
  - 親 O2 が isDeleted=true
  - 子 I21 / I22 も isDeleted=true
  - 子 I21 / I22 の deletedAt / deletedBy も更新される

---

## DEL-03: アクティブ子の個別 DELETE
- 目的: 子 DELETE により子のみ論理削除され、親は未変更であること
- 前提:
  - Orders('O3'): isDeleted=false
  - OrderItems('I31'): isDeleted=false
- 操作:
  - `DELETE /OrderService/OrderItems('I31')`
- 期待結果:
  - Orders('O3').isDeleted は false のまま
  - OrderItems('I31').isDeleted == true

---

## DEL-03-extended: 子削除による孫カスケード
- 目的: 子を削除したとき、配下の孫以降もすべてカスケード削除されること
- 前提:
  - Orders('O3B'): isDeleted=false
  - OrderItems('I31B'): isDeleted=false
  - ItemDetails('D311B', parent='I31B'): isDeleted=false
- 操作:
  - `DELETE /OrderService/OrderItems('I31B')`
- 期待結果:
  - Orders('O3B').isDeleted は false のまま
  - OrderItems('I31B').isDeleted == true
  - ItemDetails('D311B').isDeleted == true (孫もカスケード)
  - ItemDetails('D311B').deletedAt / deletedBy も更新される

---

## DEL-04: ドラフト破棄時は物理削除
- 目的: ドラフト破棄でドラフト行が物理削除され、論理削除されないこと
- 前提:
  - Orders_draft('OD4'): isDeleted=false, IsActiveEntity=false
  - OrderItems_draft('ID41'): isDeleted=false
- 操作:
  - `POST /OrderService/Orders(ID='OD4',IsActiveEntity=false)/OrderService.draftCancel`
- 期待結果:
  - Orders_draft('OD4') が物理削除されている
  - OrderItems_draft('ID41') も物理削除されている
  - アクティブ側に影響なし

---

## DEL-05: ドラフト子削除（isDeleted=true）
- 目的: ドラフト編集中に削除した子に isDeleted=true が設定されること
- 前提:
  - Orders('O5'), OrderItems('I51') はアクティブ
  - Orders_draft('OD5'), OrderItems_draft('ID51') が存在
- 操作:
  - `DELETE /OrderService/OrderItems(ID='ID51',IsActiveEntity=false)`
- 期待結果:
  - OrderItems_draft('ID51').isDeleted == true
  - OrderItems_draft('ID51').deletedAt / deletedBy が更新される
  - アクティブ側はまだ削除されない

---

## DEL-05-extended: ドラフト子削除による孫カスケード
- 目的: ドラフトで子を削除したとき、孫もカスケードで isDeleted=true になること
- 前提:
  - Orders_draft('OD5B'), OrderItems_draft('ID51B'), ItemDetails_draft('D511B') が存在
- 操作:
  - `DELETE /OrderService/OrderItems(ID='ID51B',IsActiveEntity=false)`
- 期待結果:
  - OrderItems_draft('ID51B').isDeleted == true
  - ItemDetails_draft('D511B').isDeleted == true (孫もカスケード)
  - ItemDetails_draft('D511B').deletedAt / deletedBy も更新される

---

## DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）
- 目的: すでに isDeleted=true のレコードに対する DELETE が成功し、副作用がないこと
- 前提:
  - Orders('O6'): isDeleted=true
- 操作:
  - `DELETE /OrderService/Orders('O6')`
- 期待結果:
  - HTTP 204
  - isDeleted / deletedAt / deletedBy は変更されない

---

# 2. アクティブ照会のテストケース（READ-A-xx）

## READ-A-01: ルート一覧（削除済み除外）
- 目的: isDeleted 指定なしでは isDeleted=false のみ返ること（R1）
- 前提:
  - A1: isDeleted=false
  - A2: isDeleted=true
- 操作:
  - `GET /OrderService/Orders`
- 期待結果:
  - A1 のみ返る

---

## READ-A-02: 削除済みのみ取得（フィルタ）
- 目的: `$filter=isDeleted eq true` が有効であること（R2）
- 前提:
  - A1: false, A2: true
- 操作:
  - `GET /OrderService/Orders?$filter=isDeleted eq true`
- 期待結果:
  - A2 のみ返る

---

## READ-A-03: `$filter=isDeleted eq false`
- 目的: 明示フィルタでも isDeleted=false のみ返る（R2）
- 操作:
  - `GET /OrderService/Orders?$filter=isDeleted eq false`
- 期待結果:
  - isDeleted=false のみ返る

---

## READ-A-04: キー指定（未削除）
- 目的: キー指定アクセスは isDeleted に関係なく返す（R3）
- 前提:
  - A3: isDeleted=false
- 操作:
  - `GET /OrderService/Orders('A3')`
- 期待結果:
  - A3 が返る

---

## READ-A-05: キー指定（削除済）
- 目的: 削除済みでもキー指定アクセスで返される（R3）
- 前提:
  - A4: isDeleted=true
- 操作:
  - `GET /OrderService/Orders('A4')`
- 期待結果:
  - isDeleted=true の A4 が返る

---

## READ-A-06: キー指定なし判定（フィルタでの疑似キー指定）
- 目的: `/Orders?$filter=ID eq 'A1'` は R1/R2 に従うこと
- 前提:
  - A1: false, A2: true
- 操作:
  - `GET /OrderService/Orders?$filter=ID eq 'A1'`
- 期待結果:
  - isDeleted=false の A1 が返る

---

## READ-A-07: 子の直接アクセス（未削除）
- 目的: 子一覧でも R1 が適用される
- 前提:
  - C71: false, C72: true
- 操作:
  - `GET /OrderService/OrderItems`
- 期待結果:
  - C71 のみ返る

---

## READ-A-08: 子の直接アクセス（削除済）
- 目的: `$filter=isDeleted eq true` で削除済のみ返る
- 操作:
  - `GET /OrderService/OrderItems?$filter=isDeleted eq true`
- 期待結果:
  - C72 のみ返る

---

## READ-A-09: 子キー指定（削除済）
- 目的: 子もキー指定アクセスで削除済を返す（R3）
- 前提:
  - C9: isDeleted=true
- 操作:
  - `GET /OrderService/OrderItems('C9')`
- 期待結果:
  - C9 が返る

---

## READ-A-10: 親未削除 + `$expand`（子の削除済除外）
- 目的: 親未削除の `$expand` では R1 が適用される
- 前提:
  - 親 N10: isDeleted=false
  - 子 N101: false
  - 子 N102: true
- 操作:
  - `GET /OrderService/Orders('N10')?$expand=items`
- 期待結果:
  - items には N101 のみ含まれる

---

## READ-A-11: 親未削除 + Navigation + isDeleted=true
- 目的: Navigation + フィルタなら R2 を適用し削除済のみ返す
- 操作:
  - `/Orders('N10')/items?$filter=isDeleted eq true`
- 期待結果:
  - N102 のみ返る

---

## READ-A-12: 親削除済 + `$expand`（削除済子を返す）
- 目的: 親削除済では R4 により削除済子が返る
- 前提:
  - 親 N12: isDeleted=true
  - 子 N121: isDeleted=true
- 操作:
  - `/Orders('N12')?$expand=items`
- 期待結果:
  - items に N121 を含む

---

## READ-A-13: 親削除済 + Navigation + isDeleted=false（ヒットなし）
- 目的: カスケード削除済のため未削除子が存在しない
- 操作:
  - `/Orders('N12')/items?$filter=isDeleted eq false`
- 期待結果:
  - 空配列

---

## READ-A-14: 深い階層の$expand（親削除済）
- 目的: 親が削除済の場合、$expandで深い階層を展開しても全ての階層が削除済として返る
- 前提:
  - Orders('N14'): isDeleted=true
  - OrderItems('N141'): isDeleted=true
  - ItemDetails('N1411'): isDeleted=true
- 操作:
  - `GET /OrderService/Orders('N14')?$expand=items($expand=details)`
- 期待結果:
  - items に N141 を含む
  - items[0].details に N1411 を含む
  - すべて isDeleted=true

---

## READ-A-15: 複合キー指定（すべてのキー指定）
- 目的: 複合キーをすべて指定した場合、R3が適用され isDeleted に関係なく返る
- 前提:
  - Books(ID=1,version=2): isDeleted=true
- 操作:
  - `GET /BookService/Books(ID=1,version=2)`
- 期待結果:
  - Books(ID=1,version=2) が返る（isDeleted=true でも返る）

---

## READ-A-16: 複合キー部分指定（キー指定扱いにならない）
- 目的: 複合キーの一部のみ指定した場合、R1が適用され isDeleted=false のみ返る
- 前提:
  - Books(ID=1,version=1): isDeleted=false
  - Books(ID=1,version=2): isDeleted=true
- 操作:
  - `GET /BookService/Books?$filter=ID eq 1`
- 期待結果:
  - Books(ID=1,version=1) のみ返る（isDeleted=false のみ）

---

# 3. ドラフト照会のテストケース（READ-D-xx）

## READ-D-01: ドラフトルート一覧（未削除のみ）
- 目的: R1 により isDeleted=false のドラフトのみ返る
- 前提:
  - D1: isDeleted=false
- 操作:
  - `GET /OrderService/Orders_draft?$filter=IsActiveEntity eq false`
- 期待結果:
  - D1 が返る

---

## READ-D-02: ドラフトルート + isDeleted=true フィルタ（該当なし）
- 目的: 仕様上ドラフトルートは論理削除されない
- 操作:
  - `GET /OrderService/Orders_draft?$filter=isDeleted eq true`
- 期待結果:
  - 空配列

---

## READ-D-03: ドラフトルートキー指定（未削除）
- 操作:
  - `GET /OrderService/Orders_draft('D3')`
- 期待結果:
  - D3 が返る

---

## READ-D-04: ドラフト子一覧（未削除のみ）
- 前提:
  - DI41: false
  - DI42: true
- 操作:
  - `/OrderItems_draft?$filter=IsActiveEntity eq false`
- 期待結果:
  - DI41 のみ返る

---

## READ-D-05: ドラフト子一覧（削除済みのみ）
- 操作:
  - `/OrderItems_draft?$filter=isDeleted eq true`
- 期待結果:
  - DI42 のみ返る

---

## READ-D-06: ドラフト子キー指定（削除済でも返る）
- 前提:
  - DI6: true
- 操作:
  - `/OrderItems_draft('DI6')`
- 期待結果:
  - DI6 が返る

---

## READ-D-07: 親ドラフト未削除 + `$expand`（子の削除済除外）
- 前提:
  - D7: false
  - DI71: false
  - DI72: true
- 操作:
  - `/Orders_draft('D7')?$expand=items`
- 期待結果:
  - items には DI71 のみ含まれる

---

## READ-D-08: 親ドラフト未削除 + Navigation + isDeleted=true
- 操作:
  - `/Orders_draft('D7')/items?$filter=isDeleted eq true`
- 期待結果:
  - DI72 のみ返る

---

# 4. ドラフト有効化のテストケース（ACT-xx）

## ACT-01: 新規ドラフト子を isDeleted=true にして有効化（アクティブ未作成）
- 目的: 新規子が isDeleted=true の場合はアクティブに作成されない
- 前提:
  - アクティブ側: Orders('A100') のみ、子なし
  - ドラフト: Orders_draft('D100')
  - ドラフト子 DI101: isDeleted=true（一度も有効化していない新規子）
  - アクティブ側に対応する子レコードは存在しない
- 操作:
  - `POST /OrderService/Orders(ID='A100',IsActiveEntity=true)/OrderService.draftActivate`
- 期待結果:
  - アクティブ側 OrderItems に DI101 に対応する子が作成されない（物理削除される）

---

## ACT-02: 既存子を isDeleted=true にして有効化（アクティブへ反映）
- 目的: フレームワークにより既存子の isDeleted=true がアクティブへ反映される
- 前提:
  - アクティブ側: Orders('A200'), OrderItems('AI201': isDeleted=false)
  - ドラフト側: Orders_draft('D200')
  - ドラフト子 DI201: isDeleted=true（AI201 に対応）
- 操作:
  - `POST /OrderService/Orders(ID='A200',IsActiveEntity=true)/OrderService.draftActivate`
- 期待結果:
  - アクティブ OrderItems('AI201').isDeleted == true
  - アクティブ OrderItems('AI201').deletedAt / deletedBy も更新される

---

# End of File
