launch-unity
=================

[English](README.md) | [日本語](README.ja.md)

Unity Hubを仲介せず、コマンドラインからUnityを立ち上げます。

## インストール

```bash
# グローバルインストール
npm install -g launch-unity

# npxで一時利用（インストール不要）
npx launch-unity
```

## 使い方
```bash
# 構文
launch-unity [OPTIONS] [PROJECT_PATH] [PLATFORM] [-- UNITY_ARGS...]
launch-unity update

# 引数
#   PROJECT_PATH    Unityプロジェクトのディレクトリ（省略時は3階層下まで探索）
#   PLATFORM        Unityの -buildTarget に渡す値（例: StandaloneOSX, Android, iOS）

# オプション
#   -h, --help      ヘルプを表示
#   -r, --restart   Unityを再起動
#   -a, -u, --add-unity-hub, --unity-hub-entry
#                   Unity Hub に登録（Unityは起動しない）
#   -f, --favorite  Unity Hub にお気に入りとして登録（Unityは起動しない）

# 例
npx launch-unity                   # プロジェクトを探索して開く
npx launch-unity /path/to/Proj     # 指定プロジェクトを開く
npx launch-unity /path Android     # ビルドターゲットを指定
npx launch-unity -r                # Unityを再起動
npx launch-unity -a                # Unity Hub に登録のみ（Unityは起動しない）
npx launch-unity -f                # Unity Hub にお気に入り登録（Unityは起動しない）
npx launch-unity . -- -batchmode -quit -nographics -logFile -  # Unity引数を渡す
npx launch-unity /path Android -- -executeMethod My.Build.Entry

# 自己更新（npmグローバルインストール向け）
launch-unity update

# `update` という名前のディレクトリを開きたい場合は明示する
launch-unity ./update
```

指定した Unity プロジェクトの `ProjectSettings/ProjectVersion.txt` から必要な Unity Editor のバージョンを読み取り、
Unity Hub でインストール済みの該当バージョンを起動する macOS/Windows 向け TypeScript 製 CLI です。

既定で想定する Unity のパス:
- macOS: `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`
- Windows（検索対象）:
  - `%PROGRAMFILES%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%PROGRAMFILES(X86)%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%LOCALAPPDATA%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `C:\\Program Files\\Unity\\Hub\\Editor\\<version>\\Editor\\Unity.exe`


## トラブルシューティング
- エラー: `ProjectVersion.txt not found`
  - 指定ディレクトリが Unity プロジェクト直下ではありません。プロジェクトのルートを指定してください。
- エラー: `Unity <version> not found`
  - 該当バージョンの Unity を Unity Hub でインストールしてください。独自パスの場合は解決ロジックの修正を検討してください。

## プラットフォーム注意事項
- macOS / Windows: Unity Hub のデフォルトインストールパスを前提にサポート。
- Linux: 未対応です。対応 PR を歓迎します。

## セキュリティ

このプロジェクトはサプライチェーン攻撃対策を実施しています：

- **ignore-scripts**: `npm install` 時の自動スクリプト実行を無効化
- **Dependabot**: 週次の自動セキュリティアップデート
- **Security audit CI**: PR ごとに `npm audit` と `lockfile-lint` を実行
- **バージョン固定**: すべての依存関係で厳密なバージョンを指定（`^` や `~` 不使用）

## ライセンス
- MIT。詳細は `LICENSE` を参照してください。
