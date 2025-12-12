# Soft Delete Plugin — Test Specification
（updated spec based on 2025-02 version）

本ドキュメントは、最新版仕様に基づいて作成したテストケース一覧である。
すべて箇条書きのみで記述し、表形式は使用しない。

---

## テストケース一覧

### 1. 削除時のテストケース（DEL-xx）
- DEL-01: アクティブルートの論理削除
- DEL-02: ルート削除による Composition 子カスケード
- DEL-03: アクティブ子の個別 DELETE
- DEL-03-extended: 子削除による孫カスケード
- DEL-03-nav: ナビゲーションパス経由でのアクティブ子の個別 DELETE
- DEL-04: ドラフト破棄時は物理削除
- DEL-05: ドラフト子削除（isDeleted=true）
- DEL-05-extended: ドラフト子削除による孫カスケード
- DEL-05-nav: ナビゲーションパス経由でのドラフト子削除（isDeleted=true）
- DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）
- DEL-07: アクティブ孫の個別 DELETE
- DEL-07-nav: ナビゲーションパス経由でのアクティブ孫の個別 DELETE
- DEL-08: ドラフト孫の個別 DELETE
- DEL-08-nav: ナビゲーションパス経由でのドラフト孫の個別 DELETE
- DEL-09: @softdelete.enabled未指定エンティティの物理削除

### 2. アクティブ照会のテストケース（READ-A-xx）
- READ-A-01: ルート一覧（削除済み除外）
- READ-A-02: 削除済みのみ取得（フィルタ）
- READ-A-03: `$filter=isDeleted eq false`
- READ-A-04: キー指定（未削除）
- READ-A-05: キー指定（削除済）
- READ-A-06: キー指定なし判定（フィルタでの疑似キー指定）
- READ-A-07: 子の直接アクセス（未削除）
- READ-A-08: 子の直接アクセス（削除済）
- READ-A-09: 子キー指定（削除済）
- READ-A-10: 親未削除 + `$expand`（子の削除済除外）
- READ-A-11: 親未削除 + Navigation + isDeleted=true
- READ-A-12: 親削除済 + `$expand`（削除済子を返す）
- READ-A-13: 親削除済 + Navigation + isDeleted=false（ヒットなし）
- READ-A-14: 深い階層の$expand（親削除済）
- READ-A-15: 複合キー指定（すべてのキー指定）
- READ-A-16: 複合キー部分指定（キー指定扱いにならない）

### 3. ドラフト照会のテストケース（READ-D-xx）
- READ-D-01: ドラフトルート一覧（未削除のみ）
- READ-D-02: ドラフトルート + isDeleted=true フィルタ（該当なし）
- READ-D-03: ドラフトルートキー指定（未削除）
- READ-D-04: ドラフト子一覧（削除済も含む）— ドラフト編集中の削除を確認可能
- READ-D-05: ドラフト子キー指定（削除済でも返る）
- READ-D-06: 親ドラフト未削除 + `$expand`（削除済子も含む）— ドラフト編集中の削除を確認可能
- READ-D-07: 親ドラフト未削除 + Navigation + isDeleted=true

### 4. ドラフト有効化のテストケース（ACT-xx）
- ACT-01: 新規ドラフト子を isDeleted=true にして有効化（アクティブ未作成）
- ACT-02: 既存子を isDeleted=true にして有効化（アクティブへ反映）

### 5. バリデーションのテストケース（VAL-xx）
- VAL-01: @softdelete.enabled付きエンティティにすべての必須フィールドがある場合の起動成功
- VAL-02: @softdelete.enabled付きエンティティにsoftdeleteアスペクトがない場合の起動失敗（手動テスト）

### 6. フィールド保護のテストケース（PROT-xx）
- PROT-01: CREATE時にisDeletedを指定しても無視される
- PROT-02: UPDATE時にisDeletedを更新しようとしても無視される
- PROT-03: PATCH時にdeletedAtを更新しようとしても無視される
- PROT-04: PATCH時にdeletedByを更新しようとしても無視される

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

## DEL-03-nav: ナビゲーションパス経由でのアクティブ子の個別 DELETE
- 目的: ナビゲーションパス経由で子を DELETE したとき、子のみ論理削除され、親は未変更であること
- 前提:
  - Orders('O3N'): isDeleted=false
  - OrderItems('I31N'): isDeleted=false
- 操作:
  - `DELETE /OrderService/Orders('O3N')/items('I31N')`
- 期待結果:
  - Orders('O3N').isDeleted は false のまま
  - OrderItems('I31N').isDeleted == true

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

## DEL-05-nav: ナビゲーションパス経由でのドラフト子削除（isDeleted=true）
- 目的: ナビゲーションパス経由でドラフト編集中に削除した子に isDeleted=true が設定されること
- 前提:
  - Orders('O5N'), OrderItems('I51N') はアクティブ
  - Orders_draft('O5N'), OrderItems_draft('I51N') が存在（編集モード）
- 操作:
  - `DELETE /OrderService/Orders(ID='O5N',IsActiveEntity=false)/items(ID='I51N',IsActiveEntity=false)`
- 期待結果:
  - OrderItems_draft('I51N').isDeleted == true
  - OrderItems_draft('I51N').deletedAt / deletedBy が更新される
  - アクティブ側はまだ削除されない

---

## DEL-07: アクティブ孫の個別 DELETE
- 目的: 孫を直接 DELETE したとき、孫のみ論理削除され、親・子は未変更であること
- 前提:
  - Orders('O7'): isDeleted=false
  - OrderItems('I71'): isDeleted=false
  - ItemDetails('D711'): isDeleted=false
- 操作:
  - `DELETE /OrderService/ItemDetails('D711')`
- 期待結果:
  - Orders('O7').isDeleted は false のまま
  - OrderItems('I71').isDeleted は false のまま
  - ItemDetails('D711').isDeleted == true
  - ItemDetails('D711').deletedAt / deletedBy が更新される

---

## DEL-07-nav: ナビゲーションパス経由でのアクティブ孫の個別 DELETE
- 目的: ナビゲーションパス経由で孫を DELETE したとき、孫のみ論理削除され、親・子は未変更であること
- 前提:
  - Orders('O7N'): isDeleted=false
  - OrderItems('I71N'): isDeleted=false
  - ItemDetails('D711N'): isDeleted=false
- 操作:
  - `DELETE /OrderService/Orders('O7N')/items('I71N')/details('D711N')`
- 期待結果:
  - Orders('O7N').isDeleted は false のまま
  - OrderItems('I71N').isDeleted は false のまま
  - ItemDetails('D711N').isDeleted == true
  - ItemDetails('D711N').deletedAt / deletedBy が更新される

---

## DEL-08: ドラフト孫の個別 DELETE
- 目的: ドラフト編集中に孫を削除したとき、孫に isDeleted=true が設定されること
- 前提:
  - Orders('O8'), OrderItems('I81'), ItemDetails('D811') はアクティブ
  - Orders_draft('O8'), OrderItems_draft('I81'), ItemDetails_draft('D811') が存在（編集モード）
- 操作:
  - `DELETE /OrderService/ItemDetails(ID='D811',IsActiveEntity=false)`
- 期待結果:
  - Orders_draft('O8').isDeleted は false のまま
  - OrderItems_draft('I81').isDeleted は false のまま
  - ItemDetails_draft('D811').isDeleted == true
  - ItemDetails_draft('D811').deletedAt / deletedBy が更新される
  - アクティブ側はまだ削除されない

---

## DEL-08-nav: ナビゲーションパス経由でのドラフト孫の個別 DELETE
- 目的: ナビゲーションパス経由でドラフト編集中に孫を削除したとき、孫に isDeleted=true が設定されること
- 前提:
  - Orders('O8N'), OrderItems('I81N'), ItemDetails('D811N') はアクティブ
  - Orders_draft('O8N'), OrderItems_draft('I81N'), ItemDetails_draft('D811N') が存在（編集モード）
- 操作:
  - `DELETE /OrderService/Orders(ID='O8N',IsActiveEntity=false)/items(ID='I81N',IsActiveEntity=false)/details(ID='D811N',IsActiveEntity=false)`
- 期待結果:
  - Orders_draft('O8N').isDeleted は false のまま
  - OrderItems_draft('I81N').isDeleted は false のまま
  - ItemDetails_draft('D811N').isDeleted == true
  - ItemDetails_draft('D811N').deletedAt / deletedBy が更新される
  - アクティブ側はまだ削除されない

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

## DEL-09: @softdelete.enabled未指定エンティティの物理削除
- 目的: @softdelete.enabled アノテーションが付いていないエンティティは物理削除されること
- 前提:
  - Products(ID=999): name='Test Product', price=100（Productsエンティティには@softdelete.enabledが付いていない）
- 操作:
  - `DELETE /BookService/Products(ID=999)`
- 期待結果:
  - HTTP 204
  - Products(ID=999)がデータベースから物理削除される
  - その後の `GET /BookService/Products(ID=999)` は 404 を返す
  - 論理削除ではなく物理削除される

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

## READ-D-04: ドラフト子一覧（削除済も含む）
- 目的: ドラフト編集中に削除したアイテムを確認できる（復元の機会を提供）
- 前提:
  - DI41: false
  - DI42: true（ドラフト編集中に削除）
- 操作:
  - `/OrderItems_draft?$filter=IsActiveEntity eq false`
- 期待結果:
  - DI41, DI42 の両方が返る（削除済も含む）
  - DI41.isDeleted == false
  - DI42.isDeleted == true

---

## READ-D-05: ドラフト子キー指定（削除済でも返る）
- 前提:
  - DI6: true
- 操作:
  - `/OrderItems_draft('DI6')`
- 期待結果:
  - DI6 が返る

---

## READ-D-06: 親ドラフト未削除 + `$expand`（削除済子も含む）
- 目的: ドラフト編集中に削除した子アイテムを $expand で確認できる
- 前提:
  - D7: false
  - DI71: false
  - DI72: true（ドラフト編集中に削除）
- 操作:
  - `/Orders_draft('D7')?$expand=items`
- 期待結果:
  - items には DI71, DI72 の両方が含まれる（削除済も含む）
  - DI71.isDeleted == false
  - DI72.isDeleted == true

---

## READ-D-07: 親ドラフト未削除 + Navigation + isDeleted=true
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

# 5. バリデーションのテストケース（VAL-xx）

## VAL-01: @softdelete.enabled付きエンティティにすべての必須フィールドがある場合の起動成功
- 目的: 正しく設定されたエンティティではサーバーが正常に起動すること
- 前提:
  - エンティティに `@softdelete.enabled` アノテーションが設定されている
  - エンティティに `softdelete` アスペクトが適用されている（isDeleted、deletedAt、deletedBy を含む）
- 操作:
  - サーバーを起動する
- 期待結果:
  - サーバーが正常に起動する
  - エラーが発生しない

---

## VAL-02: @softdelete.enabled付きエンティティにsoftdeleteアスペクトがない場合の起動失敗（手動テスト）
- 目的: 必須フィールドが欠けている場合、サーバー起動時にエラーが発生すること
- 前提:
  - エンティティに `@softdelete.enabled` アノテーションが設定されている
  - エンティティに `softdelete` アスペクトが適用されていない（isDeleted、deletedAt、deletedBy のいずれかまたはすべてが欠けている）
- 操作:
  - サーバーを起動する
- 期待結果:
  - サーバーの起動に失敗する
  - エラーメッセージに欠けているフィールド（isDeleted、deletedAt、deletedByのいずれか）が示される
- 注意:
  - このテストは手動で実行する必要がある
  - 自動テストで実装するには、不正な設定の別プロジェクトが必要となり複雑になるため
  - バリデーションロジック自体は cds-plugin.js:33-45 に実装済み

---

# 6. フィールド保護のテストケース（PROT-xx）

## PROT-01: CREATE時にisDeletedを指定しても無視される
- 目的: @readonlyアノテーションによりCREATE時に指定したisDeletedの値が無視されること
- 前提:
  - Orders エンティティに softdelete アスペクトが適用されている
- 操作:
  - `POST /OrderService/Orders` with body: `{"ID": "P1", "isDeleted": true}`
- 期待結果:
  - レコードが作成される
  - Orders('P1').isDeleted == false（デフォルト値が使用される）
  - リクエストボディの isDeleted=true は無視される

---

## PROT-02: UPDATE時にisDeletedを更新しようとしても無視される
- 目的: @readonlyアノテーションによりUPDATE時にisDeletedの値を変更できないこと
- 前提:
  - Orders('P2'): isDeleted=false
- 操作:
  - `PUT /OrderService/Orders('P2')` with body: `{"ID": "P2", "isDeleted": true}`
- 期待結果:
  - Orders('P2').isDeleted は false のまま（変更されない）
  - リクエストボディの isDeleted=true は無視される
  - エラーにはならない

---

## PROT-03: PATCH時にdeletedAtを更新しようとしても無視される
- 目的: @readonlyアノテーションによりPATCH時にdeletedAtの値を変更できないこと
- 前提:
  - Orders('P3'): deletedAt=null
- 操作:
  - `PATCH /OrderService/Orders('P3')` with body: `{"deletedAt": "2025-01-01T00:00:00Z"}`
- 期待結果:
  - Orders('P3').deletedAt は null のまま（変更されない）
  - リクエストボディの deletedAt は無視される
  - エラーにはならない

---

## PROT-04: PATCH時にdeletedByを更新しようとしても無視される
- 目的: @readonlyアノテーションによりPATCH時にdeletedByの値を変更できないこと
- 前提:
  - Orders('P4'): deletedBy=null
- 操作:
  - `PATCH /OrderService/Orders('P4')` with body: `{"deletedBy": "user123"}`
- 期待結果:
  - Orders('P4').deletedBy は null のまま（変更されない）
  - リクエストボディの deletedBy は無視される
  - エラーにはならない

---

# End of File
