# Soft Delete Plugin — Issues

テスト仕様に基づくテスト実装中に発見された、プラグインそのものの問題と対応状況を記録する。

---

## Issue-01: DELETE操作の冪等性が保証されていない

### 概要
すでに `isDeleted=true` のレコードに対して DELETE を実行すると、`deletedAt` が更新されてしまう。
DELETE 操作は冪等であるべきで、同じレコードに対して複数回 DELETE を実行しても結果は変わらないべき。

### 対応テストケース
- DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）

### 現在の動作
```javascript
// 1回目の削除
await DELETE(`/odata/v4/order/Orders('O6')`)
const { data: firstDelete } = await GET(`/odata/v4/order/Orders('O6')`)
// firstDelete.deletedAt = '2025-12-03T20:50:06.582Z'

// 2回目の削除
await DELETE(`/odata/v4/order/Orders('O6')`)
const { data: secondDelete } = await GET(`/odata/v4/order/Orders('O6')`)
// secondDelete.deletedAt = '2025-12-03T20:50:06.588Z' <- 更新されてしまう
```

### 期待される動作
```javascript
// 2回目の削除でも deletedAt は変更されない
expect(secondDelete.deletedAt).to.equal(firstDelete.deletedAt)
expect(secondDelete.deletedBy).to.equal(firstDelete.deletedBy)
```

### 修正案
`cds-plugin.js` の DELETE ハンドラで、既に `isDeleted=true` のレコードに対しては UPDATE をスキップする。

```javascript
srv.on('DELETE', targets, async(req) => {
    LOG.info(`Soft deleting from ${req.target.name}`)

    // Check if already soft deleted (idempotency)
    const existing = await SELECT.one.from(req.target).where(req.data)
    if (existing && existing.isDeleted === true) {
        LOG.info(`Record already soft deleted, skipping update`)
        return req.reply(204)
    }

    // Set isDeleted=true and deletedAt=timestamp instead of physically deleting
    const now = new Date().toISOString()
    const deletionData = {
        isDeleted: true,
        deletedAt: now,
        deletedBy: req.user?.id || 'system'
    }

    // ... rest of the code
})
```

### ステータス
- [ ] 未対応
- テスト: `describe.skip` で一時的にスキップ中

---

## Issue-02: ドラフトエンティティで明示的な isDeleted フィルタが機能しない

### 概要
ドラフトエンティティに対して `$filter=isDeleted eq true` を明示的に指定しても、削除済レコードが返されない。
プラグインはドラフトエンティティに対してREADハンドラでフィルタを適用しないため、ユーザーが明示的に指定したフィルタは標準の動作で処理されるべきだが、実際には空配列が返る。

### 対応テストケース
- READ-D-05: ドラフト子一覧（削除済のみ）

### 現在の動作
```javascript
// ドラフト子一覧を削除済のみ取得
const { data } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted eq true`)
// 結果: 空配列が返る（期待: 削除済アイテムDI52が返る）
```

### 期待される動作
ドラフトエンティティでは自動フィルタは適用されないが、ユーザーが明示的に指定した `$filter=isDeleted eq true` は標準のCAP動作で処理され、削除済レコードが返されるべき。

```javascript
// 期待: DI52 が返る（isDeleted=true）
const { data } = await GET(`/odata/v4/order-draft/OrderItems?$filter=isDeleted eq true`)
expect(data.value).to.have.lengthOf(1)
expect(data.value[0].ID).to.equal('DI52')
expect(data.value[0].isDeleted).to.be.true
```

### 原因調査結果 (2025-12-05)

#### 調査方法
curlを使って実際のHTTPリクエストとログを分析：
- ドラフトオーダーを作成し、アイテムを論理削除
- `$filter=isDeleted eq true` でクエリ
- プラグインのデバッグログを確認

#### 根本原因
**プラグインの `.drafts` チェック ([cds-plugin.js:114](cci:1://file:///home/miyasuta/projects/cds-softdelete-plugin/cds-plugin.js:114:0-114:0)) が不十分**

```javascript
if (req.target?.name?.endsWith('.drafts')) {
    LOG.debug('Skipping isDeleted filter for draft entity:', req.target.name)
    return
}
```

このチェックは**内部的な draft テーブル名**（例: `OrderDraftService.OrderItems.drafts`）に対してのみ機能する。

しかし、OData経由でドラフトエンティティにアクセスする場合：
- URL: `/odata/v4/order-draft/OrderItems?$filter=isDeleted eq true`
- `req.target.name`: `OrderDraftService.OrderItems` （`.drafts` で終わっていない！）
- 結果: `.drafts` チェックを**パス**して、自動フィルタ `isDeleted=false` が追加される
- ユーザー指定の `isDeleted eq true` と矛盾（`isDeleted=true AND isDeleted=false`）
- 結果として空配列が返される

#### 証拠
デバッグログから：
```
[soft-delete] - Soft deleting draft entity OrderDraftService.OrderItems.drafts
[soft-delete] - Filtering records with isDeleted = false  <- 自動フィルタが適用されている！
```

#### 追加の確認事項
ドラフト対応サービスでは、`IsActiveEntity` パラメータでアクティブ/ドラフトを切り替える：
- アクティブ: `IsActiveEntity=true` または未指定
- ドラフト: `IsActiveEntity=false` または draft編集中

プラグインは `IsActiveEntity` を考慮していないため、ドラフトアクセスでも自動フィルタを適用してしまう。

### 修正案
1. **Option A**: `req.target` の draft 状態を確認する
   - `req.target.drafts` プロパティの有無をチェック
   - `req.query` 内の `IsActiveEntity` パラメータを確認

2. **Option B**: `req.event` の context を確認
   - Draft edit セッション中かどうかを判定

3. **Option C**: ドラフトサービス全体をスキップ
   - サービス名に "draft" が含まれる場合はスキップ（簡易的だが効果的）

### ステータス
- [x] 原因特定完了
- [ ] 修正未実装
- テスト: READ-D-05 が失敗中

---

## テスト実装状況

### 削除時のテストケース（DEL-xx）: 7/8 実装完了
- ✅ DEL-01: アクティブルートの論理削除
- ✅ DEL-02: ルート削除による Composition 子カスケード
- ✅ DEL-03: アクティブ子の個別 DELETE
- ✅ DEL-03-extended: 子削除による孫カスケード
- ✅ DEL-04: ドラフト破棄時は物理削除
- ✅ DEL-05: ドラフト子削除（isDeleted=true）
- ✅ DEL-05-extended: ドラフト子削除による孫カスケード
- ⏭️ DEL-06: isDeleted=true レコードへの再 DELETE（Issue-01）

### アクティブ照会のテストケース（READ-A-xx）: 16/16 実装完了
- ✅ READ-A-01: アクティブルート一覧（未削除のみ）
- ✅ READ-A-02: アクティブルート一覧（削除済のみ）
- ✅ READ-A-03: アクティブルートキー指定（未削除）
- ✅ READ-A-04: アクティブルートキー指定（削除済でも返る）
- ✅ READ-A-05: $filter なし（疑似キー指定）
- ✅ READ-A-06: キー指定なし判定（フィルタでの疑似キー指定）
- ✅ READ-A-07: 子の直接アクセス（未削除）
- ✅ READ-A-08: 子の直接アクセス（削除済）
- ✅ READ-A-09: 子キー指定（削除済）
- ✅ READ-A-10: 親未削除 + $expand（子の削除済除外）
- ✅ READ-A-11: 親未削除 + Navigation + isDeleted=true
- ✅ READ-A-12: 親削除済 + $expand（削除済子を返す）
- ✅ READ-A-13: 親削除済 + Navigation（isDeleted なし）
- ✅ READ-A-14: 複合キーでのキー指定（未削除）
- ✅ READ-A-15: 複合キーでのキー指定（削除済）
- ✅ READ-A-16: Association 親子（子一覧）

### ドラフト照会のテストケース（READ-D-xx）: 7/8 実装完了
- ✅ READ-D-01: ドラフトルート一覧（未削除のみ）
- ✅ READ-D-02: ドラフトルート + isDeleted=true フィルタ（該当なし）
- ✅ READ-D-03: ドラフトルートキー指定（未削除）
- ✅ READ-D-04: ドラフト子一覧（削除済も含む）
- ❌ READ-D-05: ドラフト子一覧（削除済のみ）（Issue-02）
- ✅ READ-D-06: ドラフト子キー指定（削除済でも返る）
- ✅ READ-D-07: 親ドラフト未削除 + $expand（削除済子も含む）
- ✅ READ-D-08: 親ドラフト未削除 + Navigation + isDeleted=true

### ドラフト有効化のテストケース（ACT-xx）: 2/2 実装完了
- ✅ ACT-01: 新規ドラフト子を isDeleted=true にして有効化（アクティブ未作成）
- ✅ ACT-02: 既存子を isDeleted=true にして有効化（アクティブへ反映）

---

## End of File
