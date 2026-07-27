// マスク位置調整ツール(mask-editor.html)専用スクリプト。
// LayoutConfig.regions(プレイ日付・ユーザー名マスクの矩形)を、プレビュー画像上で
// ドラッグ&リサイズしながら調整し、layoutConfig.js に貼り付け可能なコードを出力する。
// 開発者専用のツールであり、一般利用者向けの機能ではない。
(() => {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const stage = document.getElementById("editor-stage");
  const fieldsContainer = document.getElementById("editor-fields");
  const outputCode = document.getElementById("output-code");
  const copyButton = document.getElementById("copy-button");
  const copyStatus = document.getElementById("copy-status");

  const REGION_COLORS = {
    playDate: "#ff6f91",
    username: "#4c9aff"
  };
  const DEFAULT_COLOR = "#ff6f91";
  const MIN_SIZE = 0.02;

  // LayoutConfig.regions を直接書き換えないよう、編集用にディープコピーして保持する
  const regions = LayoutConfig.regions.map((region) => ({ ...region, rect: { ...region.rect } }));

  // 各リージョンのDOM要素・入力欄への参照(id -> { box, inputs: { x, y, w, h } })
  const regionEls = {};

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function applyRectStyle(box, rect) {
    box.style.left = `${rect.x * 100}%`;
    box.style.top = `${rect.y * 100}%`;
    box.style.width = `${rect.w * 100}%`;
    box.style.height = `${rect.h * 100}%`;
  }

  function updateInputs(region) {
    const { inputs } = regionEls[region.id];
    for (const key of ["x", "y", "w", "h"]) {
      // 入力中のフィールドの値は上書きしない(カーソル位置がリセットされるため)
      if (document.activeElement === inputs[key]) continue;
      inputs[key].value = region.rect[key].toFixed(4);
    }
  }

  function updateOutputCode() {
    const lines = regions.map((region) => {
      const r = region.rect;
      const fmt = (n) => parseFloat(n.toFixed(4));
      return `    { id: "${region.id}", label: "${region.label}", rect: { x: ${fmt(r.x)}, y: ${fmt(r.y)}, w: ${fmt(r.w)}, h: ${fmt(r.h)} }, maskable: true },`;
    });
    outputCode.value = ["  regions: [", ...lines, "  ],"].join("\n");
    copyStatus.textContent = "";
  }

  function onRegionChanged(region) {
    const { box } = regionEls[region.id];
    applyRectStyle(box, region.rect);
    updateInputs(region);
    updateOutputCode();
  }

  function makeDraggable(box, region) {
    box.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("resize-handle")) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);

      const stageRect = stage.getBoundingClientRect();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startX = region.rect.x;
      const startY = region.rect.y;

      function onMove(moveEvent) {
        const dx = (moveEvent.clientX - startClientX) / stageRect.width;
        const dy = (moveEvent.clientY - startClientY) / stageRect.height;
        region.rect.x = clamp(startX + dx, 0, 1 - region.rect.w);
        region.rect.y = clamp(startY + dy, 0, 1 - region.rect.h);
        onRegionChanged(region);
      }

      function onUp() {
        box.removeEventListener("pointermove", onMove);
        box.removeEventListener("pointerup", onUp);
      }

      box.addEventListener("pointermove", onMove);
      box.addEventListener("pointerup", onUp);
    });
  }

  function makeResizable(handle, region, box) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);

      const stageRect = stage.getBoundingClientRect();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startW = region.rect.w;
      const startH = region.rect.h;

      function onMove(moveEvent) {
        const dx = (moveEvent.clientX - startClientX) / stageRect.width;
        const dy = (moveEvent.clientY - startClientY) / stageRect.height;
        region.rect.w = clamp(startW + dx, MIN_SIZE, 1 - region.rect.x);
        region.rect.h = clamp(startH + dy, MIN_SIZE, 1 - region.rect.y);
        onRegionChanged(region);
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function makeNumberField(region, key, labelText) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.001";
    input.min = "0";
    input.max = "1";
    input.value = region.rect[key].toFixed(4);
    input.addEventListener("input", () => {
      const value = parseFloat(input.value);
      if (Number.isNaN(value)) return;
      region.rect[key] = clamp(value, 0, 1);
      onRegionChanged(region);
    });
    label.appendChild(input);
    return { label, input };
  }

  function renderFields() {
    fieldsContainer.innerHTML = "";
    regions.forEach((region) => {
      const row = document.createElement("div");
      row.className = "region-fields";

      const title = document.createElement("span");
      title.className = "region-fields-label";
      title.textContent = region.label;
      row.appendChild(title);

      const inputs = {};
      for (const [key, labelText] of [["x", "X"], ["y", "Y"], ["w", "幅"], ["h", "高さ"]]) {
        const { label, input } = makeNumberField(region, key, labelText);
        inputs[key] = input;
        row.appendChild(label);
      }

      regionEls[region.id].inputs = inputs;
      fieldsContainer.appendChild(row);
    });
  }

  function renderRegionOverlays() {
    stage.querySelectorAll(".mask-region").forEach((el) => el.remove());

    regions.forEach((region) => {
      const color = REGION_COLORS[region.id] || DEFAULT_COLOR;

      const box = document.createElement("div");
      box.className = "mask-region";
      box.style.borderColor = color;
      box.style.background = hexToRgba(color, 0.25);
      applyRectStyle(box, region.rect);

      const label = document.createElement("span");
      label.className = "region-label";
      label.textContent = region.label;
      label.style.background = color;
      box.appendChild(label);

      const handle = document.createElement("span");
      handle.className = "resize-handle";
      handle.style.background = color;
      box.appendChild(handle);

      stage.appendChild(box);
      regionEls[region.id] = { box };

      makeDraggable(box, region);
      makeResizable(handle, region, box);
    });

    renderFields();
    updateOutputCode();
  }

  function setImage(image) {
    const canvas = ImageProcessor.getTrimmedCanvas(image);
    stage.querySelectorAll(":scope > *:not(.mask-region)").forEach((el) => el.remove());
    stage.insertBefore(canvas, stage.firstChild);
    renderRegionOverlays();
  }

  async function loadImageFile(file) {
    try {
      const image = await ImageProcessor.loadImageFromFile(file);
      setImage(image);
    } catch (err) {
      console.error("画像の読み込みに失敗しました:", err);
    }
  }

  function loadDefaultSample() {
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => {
      stage.innerHTML = '<p class="empty-message">samples/sample1.png を読み込めませんでした。上のフォームから画像を読み込んでください。</p>';
    };
    img.src = "samples/sample1.png";
  }

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(outputCode.value);
      copyStatus.textContent = "コピーしました";
    } catch (err) {
      outputCode.select();
      document.execCommand("copy");
      copyStatus.textContent = "コピーしました";
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) loadImageFile(file);
  });

  loadDefaultSample();
})();
