// 複数の加工済みリザルト画像を、枚数可変の自動グリッドで1枚に集約する
// 各画像は縮小せず原寸のまま配置する(列幅・行高さはそれぞれの列/行に含まれる画像の最大サイズに合わせる)
const Collage = (() => {
  const DEFAULT_GAP = 16;
  const DEFAULT_BACKGROUND = "#ffffff";

  function buildCollage(canvases, backgroundColor = DEFAULT_BACKGROUND, gap = DEFAULT_GAP) {
    const count = canvases.length;
    if (count === 0) return null;

    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const colWidths = new Array(cols).fill(0);
    const rowHeights = new Array(rows).fill(0);
    canvases.forEach((canvas, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      colWidths[col] = Math.max(colWidths[col], canvas.width);
      rowHeights[row] = Math.max(rowHeights[row], canvas.height);
    });

    const colOffsets = [];
    let xAcc = gap;
    colWidths.forEach((w) => {
      colOffsets.push(xAcc);
      xAcc += w + gap;
    });

    const rowOffsets = [];
    let yAcc = gap;
    rowHeights.forEach((h) => {
      rowOffsets.push(yAcc);
      yAcc += h + gap;
    });

    const outputWidth = xAcc;
    const outputHeight = yAcc;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const ctx = outputCanvas.getContext("2d");
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    canvases.forEach((canvas, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = colOffsets[col] + (colWidths[col] - canvas.width) / 2;
      const y = rowOffsets[row] + (rowHeights[row] - canvas.height) / 2;

      ctx.drawImage(canvas, x, y, canvas.width, canvas.height);
    });

    return outputCanvas;
  }

  return { buildCollage, DEFAULT_GAP, DEFAULT_BACKGROUND };
})();
