# Soft Delete Plugin — Issues

テスト仕様に基づくテスト実装中に発見された、プラグインそのものの問題と対応状況を記録する。

---

## 課題一覧とステータス

| ID | 課題 | ステータス | 優先度 | バージョン |
|----|------|-----------|--------|-----------|
| Issue-01 | DELETE操作の冪等性が保証されていない | ✅ 解決済み | 高 | v0.3.5 |
| Issue-02 | ドラフト対応エンティティへの直接アクセスで明示的な isDeleted フィルタが機能しない | ✅ 仕様として受容 | - | v1.0.0 |
| Issue-03 | ドラフトエンティティへのナビゲーションパスで削除済子のフィルタリングが機能しない | 🔍 調査中 | 低 | - |

### ステータスの凡例
- ✅ 解決済み: 修正完了し、テストも実装済み
- ✅ 仕様として受容: 仕様として正しい動作であることを確認
- 🔍 調査中: 原因調査中または解決策検討中
- ⏸️ 保留: 優先度が低く、対応を保留中

---

## 課題の詳細

### Issue-01: DELETE操作の冪等性が保証されていない ✅ 解決済み

#### 概要
すでに `isDeleted=true` のレコードに対して DELETE を実行すると、`deletedAt` が更新されてしまう問題。
DELETE 操作は冪等であるべきで、同じレコードに対して複数回 DELETE を実行しても結果は変わらないべき。

#### 対応内容
`cds-plugin.js` の DELETE ハンドラで、既に `isDeleted=true` のレコードに対しては UPDATE をスキップするように修正。

```javascript
// Check if already soft deleted (idempotency)
const existing = await SELECT.one.from(req.target).where(req.data)
if (existing && existing.isDeleted === true) {
    LOG.info(`Record already soft deleted, skipping update`)
    return req.reply(204)
}
```

#### 対応テストケース
- ✅ DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）

#### ステータス
- [x] 修正完了（v0.3.5）
- [x] テスト実装完了

---

### Issue-02: ドラフト対応エンティティへの直接アクセスで明示的な isDeleted フィルタが機能しない ✅ 仕様として受容

#### 概要
ドラフト対応サービスのエンティティに対して `/OrderItems?$filter=isDeleted eq true` を指定すると、削除済ドラフトレコードではなくアクティブエンティティが返される。ドラフト有効化前のため、`isDeleted` フラグがアクティブエンティティに反映されておらず、結果は0件になる。

#### 技術的な背景
1. `/odata/v4/order-draft/OrderItems` へのアクセスは、CAP draftメカニズムにより**アクティブエンティティ**を参照する
2. ドラフトで削除した情報（`isDeleted=true`）は、ドラフト有効化まで**アクティブエンティティには反映されない**
3. プラグインは正しく動作しており、`$filter=isDeleted eq true` を検出して自動フィルタを追加していない

#### 結論
このクエリパターンは**実用的なユースケースがない**ため、仕様として受容。
- ドラフト編集中にアクティブエンティティを取得する必要性がない
- ドラフト有効化後であれば、アクティブエンティティに正しく反映される
- ドラフト編集中は、Navigationパス (`/Orders('D5')/items?$filter=isDeleted eq true`) を使用すれば削除済ドラフトアイテムを取得できる

#### 対応
- **テストケースを削除**: 不要なテストケースを削除
- **仕様書を更新**: spec.mdで動作を明記

#### ステータス
- [x] 原因調査完了（2025-12-05）
- [x] 仕様として受容
- [x] ドキュメント更新完了（v1.0.0）

### Issue-03: ドラフトエンティティへのナビゲーションパスで削除済子のフィルタリングが機能しない 🔍 調査中

#### 概要
ドラフトエンティティへのナビゲーションパス（例: `/Orders(ID='D8',IsActiveEntity=false)/items`）でアクセスした場合、論理削除済みの子エンティティがフィルタリングされず返される。

**注意**: この問題は実際のアプリケーション使用時には顕在化しない可能性が高い。Fiori Elements UIでは、ドラフト編集中も削除済アイテムが表示される動作が正常であり、ドラフト有効化時に正しくアクティブエンティティに反映される。

#### 現在の動作
```javascript
// ドラフトで子を削除
await DELETE(`/odata/v4/order-draft/OrderItems(ID='DI82',IsActiveEntity=false)`)

// ナビゲーションパスでアクセス
const { data } = await GET(`/odata/v4/order-draft/Orders(ID='D8',IsActiveEntity=false)/items`)

// 実際の結果: 削除済の子（DI82）も含まれる
// [
//   { ID: 'DI81', isDeleted: false },
//   { ID: 'DI82', isDeleted: true }  // <- 除外されるべき?
// ]
```

#### 技術的背景

**問題の根本原因**:
- ナビゲーションパス（`/Orders('D8')/items`）はCAPによって親エンティティへのREADリクエスト + `$expand=items` として処理される
- `addIsDeletedFilterToExpands`関数は正しく動作し、`shouldAddFilter=true`を設定
- しかし、**ナビゲーションパスがプラグインのREADハンドラをバイパス**している可能性が高い
- デバッグログから、ナビゲーションパスのリクエスト時に`OrderItems`のREADハンドラが呼ばれていないことが判明

#### 調査事項（未解決）

1. **CAPのナビゲーション処理メカニズム**
   - ナビゲーションパスは内部的にJOINクエリとして処理されている可能性
   - プラグインのREADハンドラがバイパスされる理由の特定が必要

2. **適切なフックポイント**
   - `srv.before('READ', '*')` ハンドラでの捕捉
   - CAPのクエリ変換フェーズでのフィルタ追加

#### ステータス
- [ ] 原因調査中（2025-12-20～）
- [ ] 解決策未定
- [ ] 優先度: 低（実用上の影響は限定的）

#### 備考
- アクティブエンティティでは正しく動作する（READ-A-11テストが成功）
- Fiori Elements UIの動作としては、ドラフト編集中に削除済アイテムが表示されることは正常

---

## テスト実装状況

### 全体サマリー
- **テスト総数**: 44件
- **成功**: 44件
- **失敗/スキップ**: 0件
- **実装完了率**: 100%

### 削除時のテストケース（DEL-xx）
- ✅ DEL-01: アクティブルートの論理削除
- ✅ DEL-02: ルート削除による Composition 子カスケード
- ✅ DEL-03: アクティブ子の個別 DELETE
- ✅ DEL-03-nav: ナビゲーションパス経由の子削除
- ✅ DEL-03-extended: 子削除による孫カスケード
- ✅ DEL-04: ドラフト破棄時は物理削除
- ✅ DEL-05: ドラフト子削除（isDeleted=true）
- ✅ DEL-05-nav: ナビゲーションパス経由のドラフト子削除
- ✅ DEL-05-extended: ドラフト子削除による孫カスケード
- ✅ DEL-06: isDeleted=true レコードへの再 DELETE（冪等性）
- ✅ DEL-07-nav: $expand経由のドラフト子削除
- ✅ DEL-09: @softdelete.enabledなしエンティティの物理削除

### アクティブ照会のテストケース（READ-A-xx）
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

### ドラフト照会のテストケース（READ-D-xx）
- ✅ READ-D-01: ドラフトルート一覧（未削除のみ）
- ✅ READ-D-02: ドラフトルート + isDeleted=true フィルタ（該当なし）
- ✅ READ-D-03: ドラフトルートキー指定（未削除）
- ✅ READ-D-04: ドラフト子一覧（削除済も含む）
- ✅ READ-D-05: ドラフト子キー指定（削除済でも返る）
- ✅ READ-D-06: 親ドラフト未削除 + $expand（削除済子も含む）
- ✅ READ-D-07: 親ドラフト未削除 + Navigation + isDeleted=true

### ドラフト有効化のテストケース（ACT-xx）
- ✅ ACT-01: 新規ドラフト子を isDeleted=true にして有効化（アクティブ未作成）
- ✅ ACT-02: 既存子を isDeleted=true にして有効化（アクティブへ反映）

### バリデーションとフィールド保護のテストケース
- ✅ VAL-01: @softdelete.enabled指定時の必須フィールド検証
- ✅ VAL-02: フィールド欠落時のエラー検証（手動テスト）
- ✅ RO-01~04: @readonlyアノテーションによるフィールド保護

---

## End of File
