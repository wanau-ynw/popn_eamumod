// 1枚のリザルト画像に対する加工処理(自動トリミング・プライバシーマスク・領域の再配置)
const ImageProcessor = (() => {
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function ratioRectToPixels(rect, width, height) {
    return {
      x: Math.round(rect.x * width),
      y: Math.round(rect.y * height),
      w: Math.round(rect.w * width),
      h: Math.round(rect.h * height)
    };
  }

  function cropToCanvas(source, sx, sy, sw, sh) {
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  // 画像の上端・下端に広がる「機種依存の余白」(ステータスバー・戻るボタン・
  // ホームインジケータ・決定ボタンなど)を除いた、実際のリザルト本体の範囲を自動検出する。
  //
  // 方針: pop'n musicのリザルト画面は彩度の高い色使いなのに対し、スマホの余白(ステータスバー等)は
  // 無彩色(グレー系)であることが多い。そこで各行を「無彩色画素が多い行(=余白)」と
  // 「そうでない行(=本体)」に分類し、本体行が最も長く連続する区間を採用する。
  // ステータスバーのアイコンや、余白の途中にある「決定」ボタンのような孤立した色つき要素は
  // 行内の一部分に過ぎないため、行単位の割合判定と「最長区間」の採用によって誤検出を避けられる。
  // 戻り値は本文領域の [top, bottom) をピクセルで表す。
  function detectVerticalContentBounds(canvas, edgeConfig) {
    const { width, height } = canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;

    function isGreyPixel(x, y) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      return maxC - minC <= edgeConfig.saturationThreshold;
    }

    function isMarginRow(y) {
      let greyCount = 0;
      let total = 0;
      for (let x = 0; x < width; x += edgeConfig.sampleStride) {
        if (isGreyPixel(x, y)) greyCount++;
        total++;
      }
      return greyCount / total >= edgeConfig.greyRowThreshold;
    }

    let bestStart = -1;
    let bestLength = 0;
    let currentStart = -1;
    for (let y = 0; y < height; y++) {
      if (isMarginRow(y)) {
        currentStart = -1;
        continue;
      }
      if (currentStart === -1) currentStart = y;
      const currentLength = y - currentStart + 1;
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    }

    if (bestStart === -1) return { top: 0, bottom: height }; // 本体を検出できなければ切り落とさない
    return { top: bestStart, bottom: bestStart + bestLength };
  }

  // プレイ日付・ユーザー名を単色で塗りつぶす(画像サイズは変えず、その場に塗るだけ)
  function applyPrivacyMask(canvas, maskOptions) {
    const hasMask = Object.values(maskOptions).some(Boolean);
    if (!hasMask) return canvas;

    const config = LayoutConfig;
    const masked = cropToCanvas(canvas, 0, 0, canvas.width, canvas.height);
    const ctx = masked.getContext("2d");
    for (const region of config.regions) {
      if (!region.maskable || !maskOptions[region.id]) continue;
      const rectPx = ratioRectToPixels(region.rect, masked.width, masked.height);
      ctx.fillStyle = config.maskColor;
      ctx.fillRect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);
    }
    return masked;
  }

  // layoutMoves の内容に従って、画像の一部の要素だけを別の位置に移動する。
  // 元画像の大部分(キャラクター・スコア・曲名など)はそのまま残し、
  // 指定された「移動元」だけを切り出して退避し、その場を背景色で塗りつぶしたうえで、
  // 「移動先」にアスペクト比を保ったまま描き直す。to は元画像の範囲内に収まるよう
  // 事前に調整されている前提(画像サイズは変わらない)。
  function applyLayoutMoves(canvas) {
    const config = LayoutConfig;
    const moves = config.layoutMoves || [];
    if (moves.length === 0) return canvas;

    const baseWidth = canvas.width;
    const baseHeight = canvas.height;

    const result = cropToCanvas(canvas, 0, 0, baseWidth, baseHeight);
    const ctx = result.getContext("2d");

    // 1. 消してしまう前に、移動元の内容をすべて先に退避する
    const snapshots = moves.map((move) => {
      const fromPx = ratioRectToPixels(move.from, baseWidth, baseHeight);
      return cropToCanvas(canvas, fromPx.x, fromPx.y, fromPx.w, fromPx.h);
    });

    // 2. 移動元をまとめて背景色で塗りつぶす
    // eraseFrom が指定されていればそちらを使う(切り出す内容は文字だけでも、
    // 元の背景(ボックスの縁など)がそれより広く残ってしまう場合に、消す範囲だけ広げられる)
    ctx.fillStyle = config.layoutMoveEraseColor;
    moves.forEach((move) => {
      const erasePx = ratioRectToPixels(move.eraseFrom || move.from, baseWidth, baseHeight);
      ctx.fillRect(erasePx.x, erasePx.y, erasePx.w, erasePx.h);
    });

    // 3. 移動先に、アスペクト比を保ったまま描き直す(to.w = from.w なら等倍で縮小なし)
    moves.forEach((move, i) => {
      const toPx = ratioRectToPixels(move.to, baseWidth, baseHeight);
      const snapshot = snapshots[i];
      const scale = toPx.w / snapshot.width;
      const drawHeight = Math.round(snapshot.height * scale);
      ctx.drawImage(snapshot, toPx.x, toPx.y, toPx.w, drawHeight);
    });

    return result;
  }

  // 画像左下にツール名の透かしを小さく描画する(画像サイズは変えず、その場に描くだけ)
  function applyWatermark(canvas, showWatermark) {
    if (!showWatermark) return canvas;

    const config = LayoutConfig.watermark;
    const result = cropToCanvas(canvas, 0, 0, canvas.width, canvas.height);
    const ctx = result.getContext("2d");

    const fontSize = Math.round(canvas.height * config.fontSizeRatio);
    const margin = Math.round(canvas.height * config.marginRatio);

    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.2));
    ctx.strokeStyle = config.outlineColor;
    ctx.fillStyle = config.color;
    ctx.strokeText(config.text, margin, canvas.height - margin);
    ctx.fillText(config.text, margin, canvas.height - margin);

    return result;
  }

  // options: { maskDate, maskUsername, rearrange }
  //   maskDate/maskUsername: プライバシーマスク(独立してON/OFF可能)
  //   rearrange: layoutMoves を適用するか(OFFなら基本トリミング(+マスク)結果をそのまま返す)
  //
  // 注意: ツール名の透かし(applyWatermark)はここでは適用しない。集約画像では
  // 透かしを1箇所だけに表示したいため、透かしは呼び出し側(main.js)で
  // 個別表示用・集約画像用にそれぞれ1回だけ適用する。
  function processResultImage(image, options = {}) {
    const { maskDate = false, maskUsername = false, rearrange = false } = options;

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    sourceCanvas.getContext("2d").drawImage(image, 0, 0);

    // 1. 基本トリミング(必須・自動)
    const bounds = detectVerticalContentBounds(sourceCanvas, LayoutConfig.edgeDetection);
    const trimmedCanvas = cropToCanvas(sourceCanvas, 0, bounds.top, sourceCanvas.width, bounds.bottom - bounds.top);

    // 2. プライバシーマスク(オプション)
    const maskedCanvas = applyPrivacyMask(trimmedCanvas, { playDate: maskDate, username: maskUsername });

    // 3. 一部要素の位置移動(オプション)
    return rearrange ? applyLayoutMoves(maskedCanvas) : maskedCanvas;
  }

  return { loadImageFromFile, processResultImage, applyWatermark };
})();
