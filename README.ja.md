launch-unity
=================

[English](README.md) | [日本語](README.ja.md)

Unity Hubを仲介せず、コマンドラインからUnityを立ち上げます。

## 使用例
```bash
# NPX（推奨 / インストール不要）
npx launch-unity                    # カレントディレクトリを開く（ビルドターゲット未指定時はプロジェクトの現在のビルドターゲットを使用）
npx launch-unity /path/to/Proj      # プロジェクトを指定
npx launch-unity /path Android      # ビルドターゲットを指定
npx -y launch-unity                 # npx の「Ok to proceed?」確認をスキップ

# `--` 以降は Unity のコマンドライン引数をそのまま転送
npx launch-unity . -- -batchmode -quit -nographics -logFile -
npx launch-unity /path Android -- -executeMethod My.Build.Entry

# グローバルインストール後
launch-unity
launch-unity /path/to/MyUnityProject Android
launch-unity . -- -buildTarget iOS -projectPath . # 上書きも可能
```

指定した Unity プロジェクトの `ProjectSettings/ProjectVersion.txt` から必要な Unity Editor のバージョンを読み取り、
Unity Hub でインストール済みの該当バージョンを起動する macOS/Windows 向け TypeScript 製 CLI です。`Temp/UnityLockfile` が
存在する場合は、削除して続行するかをターミナル上で確認します。

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

## ライセンス
- MIT。詳細は `LICENSE` を参照してください。
