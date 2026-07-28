# 開発者向けメモ

このファイルは開発者向けの補足情報です。一般利用者向けの説明は [README.md](README.md) を参照してください。

## 構成
ビルド不要の静的サイト(HTML/CSS/素のJavaScriptのみ)。`index.html` をブラウザで開くだけで動作する。

| ファイル | 役割 |
| --- | --- |
| `index.html` | メイン画面(アップロード・オプション・加工結果・まとめ画像) |
| `js/layoutConfig.js` | 座標・色などの調整用パラメータを集約した設定ファイル |
| `js/imageProcessor.js` | 1枚のリザルト画像に対する加工処理(自動トリミング・マスク・並べ替え・左側トリミング・透かし) |
| `js/collage.js` | 複数枚の加工済み画像を1枚のまとめ画像に集約する処理 |
| `js/main.js` | UIイベント制御・状態管理・localStorageへのオプション保存 |
| `mask-editor.html` / `js/maskEditor.js` / `css/mask-editor.css` | マスク位置調整ツール(後述、開発者専用) |

## 座標系について
`js/layoutConfig.js` の `regions`・`layoutMoves`・`rightPanelCrop` の座標(x, y, w, h)は、すべて **自動トリミング後の画像**(`imageProcessor.js` の `detectVerticalContentBounds` でスマホの機種依存余白を除去した後の画像)の幅・高さに対する比率で指定する。絶対ピクセルではないため、端末ごとの解像度差の影響を受けない。

新しい機種のスクリーンショットで大きくズレる場合は、`samples/` に追加のサンプルを置いて実測し直す。

## マスク位置の調整ツール
プレイ日付・ユーザー名マスクの矩形位置(`js/layoutConfig.js` の `regions`)は、`mask-editor.html` を開くとプレビュー画像上でドラッグ&リサイズしながら調整できる。

- 起動時に `samples/sample1.png` を自動読み込みする。別の画像で確認したい場合はドラッグ&ドロップまたはファイル選択で読み込む。
- 矩形のドラッグで移動、右下の丸ハンドルでリサイズ。数値入力欄からも直接調整可能。
- 画面下部に `layoutConfig.js` の `regions` にそのまま貼り付けられるコードが表示される(「コピー」ボタンでクリップボードにコピー)。
- 一般利用者向けの機能ではないため、`index.html` の導線からはリンクしていない。

## 加工処理の適用順序
`imageProcessor.js` の `processResultImage` は以下の順で加工する(この順序を崩すと座標がズレる):
1. 自動トリミング(必須): `detectVerticalContentBounds` で機種依存の余白を検出して除去
2. プライバシーマスク(オプション): `regions` を単色で塗りつぶし
3. 判定内訳の並べ替え(オプション): `layoutMoves` に従って要素を移動
4. 左側パネルの切り落とし(オプション): `rightPanelCrop` より左を除去

ツール名の透かし(`applyWatermark`)はここには含まれず、個別表示用・まとめ画像用にそれぞれ呼び出し側(`main.js`)で1回ずつ適用する。

## オプションの永続化
ユーザーが選択したオプション(マスクON/OFF、色、まとめ画像の余白など)は `localStorage` の `popn_eamu_options` キーにJSON形式で保存し、次回アクセス時に復元する(`main.js` の `saveOptions` / `loadOptions`)。保存項目を追加する際はこの2関数と、旧データ(該当キーが存在しない場合)のフォールバック値を忘れずに揃える。

## 動作確認
自動テストは無いため、変更後は `samples/sample1.png` ・ `samples/sample2.png` を読み込んで目視確認する。特に自動トリミングの余白検出は機種依存の挙動なので、可能であれば実機の複数解像度のサンプルでも確認する。
