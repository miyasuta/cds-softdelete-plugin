# このプロジェクトについて
- CAP Node.jsで論理削除を実現するためのプラグイン

## 使用方法
- 論理削除対象にしたいエンティティにプラグインで提供する`softdelete`アスペクトを追加する

## 動作
- エンティティを削除したとき、isDeletedにtrueが、deletedAtにタイムスタンプが設定される
- エンティティを読み込むとき、isDeletedが指定されていなければ、isDeleted=falseをクエリに追加する

## ドキュメント構成
### docs/project/
プラグインの仕様とテスト仕様を管理するディレクトリ

- **spec.md**: プラグインの詳細な動作仕様
  - 削除時、照会時（アクティブ/ドラフト）、ドラフト有効化時の動作を定義
  - 各動作に対する判定ルール（R1-R4）を明記
  - 技術的制約（特にドラフトエンティティの自動フィルタリング除外）を記載
  - Associationの扱い（プラグインの範囲外）を明示

- **test-spec.md**: spec.mdに基づくテストケース仕様
  - 各テストケースにID（例: DEL-A-01, READ-A-01）を付与
  - spec.mdの動作仕様とテストケースが1対1で対応
  - 実装すべきテストの期待結果を詳細に記載

- **issues.md**: 発見された問題や改善点の管理
  - 既知の問題、バグ、改善提案を記録
  - 各イシューに優先度と状態を付与

### 仕様変更時のルール
1. spec.mdを先に更新する
2. test-spec.mdを対応させて更新する
3. 両ドキュメント間に矛盾がないことを確認する
4. 必要に応じてissues.mdに課題を記録する

# Gitルール
- 新しい機能を実装するときは必ず新しいブランチで作業すること
- コミットメッセージは1行にすること
- mainにマージしたブランチは削除すること

# リリース手順
GitHub Actionsにより、タグをプッシュすると自動的にnpmに公開される。

## リリース前の準備
1. 全テストが成功することを確認
```bash
cd tests/spec-test
npm test
```

2. CHANGELOG.mdを更新
   - 新バージョンのセクションを追加
   - 主要な変更内容を記載（Added, Changed, Fixed, など）

3. package.jsonのメタデータを確認
   - description, keywords, authorなどが適切か確認

## メジャーバージョンアップ（破壊的変更）
```bash
# 変更をコミット
git add .
git commit -m "docs: prepare for vX.0.0 release"

# バージョンアップ
npm version major -m "chore: release v%s"

# プッシュ（タグも含む）
git push origin main --follow-tags
```

## マイナーバージョンアップ（機能追加）
```bash
# 変更をコミット
git add .
git commit -m "docs: prepare for vX.Y.0 release"

# バージョンアップ
npm version minor -m "chore: release v%s"

# プッシュ（タグも含む）
git push origin main --follow-tags
```

## パッチバージョンアップ（バグ修正）
```bash
# 変更をコミット
git add .
git commit -m "docs: prepare for vX.Y.Z release"

# バージョンアップ
npm version patch -m "chore: release v%s"

# プッシュ（タグも含む）
git push origin main --follow-tags
```

## GitHubリリースノートの作成（必須）
プッシュ後、GitHubリリースノートを作成：
```bash
gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes "## What's Changed

- Change description 1
- Change description 2

## Installation

\`\`\`bash
npm install cds-softdelete-plugin
\`\`\`

## Links

- [CHANGELOG](https://github.com/miyasuta/cds-softdelete-plugin/blob/main/CHANGELOG.md)

---

**Full Changelog**: https://github.com/miyasuta/cds-softdelete-plugin/compare/vX.Y.Z...v1.0.0"
```

**注意**:
- リリースノートはREADMEと重複しない簡潔な内容にする
- 主要な変更点のみを記載
- インストール方法とリンクは最小限に
- Release notes must be written in English

# 実行ルール
- /tests/spec-testディレクトリにプラグインを使用するプロジェクトがある
- cds-plugin.jsに変更を加えたときは、tests/bookshopディレクトリで以下のコマンドを実行してプラグインを更新すること
```bash
cd tests/spec-test
npm run update
```
- 注意: プロジェクトルートではnpm installを実行しないこと（このプラグイン自体には依存関係がありません）

## Debugging and Log Analysis

### Viewing Test Logs

**IMPORTANT**: When searching logs from test output, always redirect **both** stdout and stderr:

```bash
# ❌ WRONG - Only captures stdout, misses most logs
npm test | grep "soft-delete"

# ✅ CORRECT - Captures both stdout and stderr
npm test 2>&1 | grep "soft-delete"

# ✅ BEST - Save to file first, then search (most reliable)
npm test > /tmp/test-output.log 2>&1
grep "soft-delete" /tmp/test-output.log

# ✅ GOOD - View last N lines
npm test 2>&1 | tail -200

# ✅ GOOD - Save and display simultaneously
npm test 2>&1 | tee /tmp/test-output.log | grep "pattern"
```

**Why `2>&1` is required**:
- CAP framework logs go to **stderr** (file descriptor 2)
- npm/test output goes to **stdout** (file descriptor 1)
- `2>&1` redirects stderr to stdout, combining both streams
- Without it, `grep` and pipes only see stdout, missing application logs

### Enable Debug Logging

Debug logging is already enabled in `tests/bookshop/package.json`:

```json
{
  "cds": {
    "log": {
      "levels": {
        "soft-delete": "debug"
      }
    }
  }
}
```

To see debug output, set the `DEBUG` environment variable:

```bash
# See plugin debug logs
DEBUG=soft-delete npm test

# See all CAP logs
DEBUG=* npm test

# See specific module logs
DEBUG=cds,soft-delete npm test
```

### Common Log Patterns

```bash
# Check plugin initialization
grep "Soft Delete Plugin: ready" /tmp/test-output.log

# See registered handlers
grep "Enabling soft delete for entities" /tmp/test-output.log

# Check READ operations filtering
grep "Filtering out soft deleted records" /tmp/test-output.log

# See by-key access detection
grep "By-key access detected" /tmp/test-output.log

# View navigation path detection
grep "Navigation path detected" /tmp/test-output.log

# See soft delete operations
grep "Soft deleting from" /tmp/test-output.log

# Check cascade delete
grep "Cascading soft delete" /tmp/test-output.log
```

### Running Specific Tests

```bash
# Run single test file
npx mocha test/OrderDraftService.test.js

# Run tests matching pattern
npx mocha test/OrderDraftService.test.js --grep "navigation path"

# Run with full output (no output buffering)
npx mocha test/OrderDraftService.test.js 2>&1 | cat
```

# SAP Development Rules for AI Assistants

## MCP Server Usage Rules

### CAP MCP Server (@cap-js/mcp-server)
- You MUST search for CDS definitions, like entities, fields and services (which include HTTP endpoints) with cds-mcp, only if it fails you MAY read *.cds files in the project.
- You MUST search for CAP docs with cds-mcp EVERY TIME you modify CDS models or when using APIs from CAP. Do NOT propose, suggest or make any changes without first checking it.
- Always refer to @cap docs for better information about SAP CAP (Cloud Application Programming) applications.

### Fiori MCP Server (@sap-ux/fiori-mcp-server)
- When asked to create an SAP Fiori elements app check whether the user input can be interpreted as an application organized into one or more pages containing table data or forms.
- When generating or modifying SAP Fiori elements applications on top of CAP services, use the Fiori MCP server if available.
- When attempting to modify SAP Fiori elements applications like adding columns, you must NOT use screen personalization but instead modify the code of the project. First check whether an MCP server provides a suitable function.
- Follow the 3-step workflow: list-functionality → get-functionality-details → execute-functionality.

### UI5 MCP Server (@ui5/mcp-server)
- This tool MUST be called once to retrieve UI5 guidelines before working on any UI5 (SAPUI5/OpenUI5) related task or project.
- Use for UI5 linting, API reference, project information, and version details.
- Always run UI5 linter after making changes and verify no new problems are introduced.

## SAP CAP Development Rules

### Project Initialization
- Always use `cds init` and don't use `cds init projectname`
- Always create nodejs CAP based applications (don't add --add, just init is fine)
- Always add `cds lint` after generating the application
- Always enable draft for CAP applications but AVOID draft on composed entities
- Don't add random samples using `cds add sample`
- MANDATORY: Set up npm workspaces for UI5 applications in package.json:
  ```json
  {
    "workspaces": [
      "app/*"
    ]
  }