// UIイベント制御と状態管理
(() => {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const resultsPanel = document.getElementById("results-panel");
  const resultsList = document.getElementById("results-list");
  const resultsEmpty = document.getElementById("results-empty");
  const collagePanel = document.getElementById("collage-panel");
  const collagePreview = document.getElementById("collage-preview");
  const maskDateCheckbox = document.getElementById("mask-date");
  const maskUsernameCheckbox = document.getElementById("mask-username");
  const rearrangeCheckbox = document.getElementById("rearrange-toggle");
  const watermarkCheckbox = document.getElementById("watermark-toggle");
  const showIndividualCheckbox = document.getElementById("show-individual-toggle");

  // items: { id, fileName, image(HTMLImageElement), baseCanvas(透かしなし), processedCanvas(表示・個別DL用、透かしあり) }
  const items = [];
  let nextId = 1;

  // オプションの状態はブラウザのlocalStorageに保存し、次回アクセス時にも同じ設定を復元する
  const OPTIONS_STORAGE_KEY = "popn_eamu_options";

  function getProcessOptions() {
    return {
      maskDate: maskDateCheckbox.checked,
      maskUsername: maskUsernameCheckbox.checked,
      rearrange: rearrangeCheckbox.checked,
      watermark: watermarkCheckbox.checked
    };
  }

  function saveOptions() {
    try {
      const options = {
        ...getProcessOptions(),
        showIndividualResults: showIndividualCheckbox.checked
      };
      localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
    } catch (err) {
      console.error("オプションの保存に失敗しました:", err);
    }
  }

  function loadOptions() {
    let saved;
    try {
      const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
      if (!raw) return;
      saved = JSON.parse(raw);
    } catch (err) {
      console.error("オプションの読み込みに失敗しました:", err);
      return;
    }
    maskDateCheckbox.checked = !!saved.maskDate;
    maskUsernameCheckbox.checked = !!saved.maskUsername;
    rearrangeCheckbox.checked = !!saved.rearrange;
    watermarkCheckbox.checked = !!saved.watermark;
    // 未保存(旧バージョンの保存データ)の場合はデフォルトの「表示」を維持する
    showIndividualCheckbox.checked = saved.showIndividualResults !== false;
  }

  function handleOptionChange() {
    saveOptions();
    reprocessAll();
  }

  function handleDisplayOptionChange() {
    saveOptions();
    renderResults();
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      try {
        const image = await ImageProcessor.loadImageFromFile(file);
        items.push({ id: nextId++, fileName: file.name, image, baseCanvas: null, processedCanvas: null });
      } catch (err) {
        console.error("画像の読み込みに失敗しました:", file.name, err);
      }
    }
    reprocessAll();
  }

  function reprocessAll() {
    const options = getProcessOptions();
    for (const item of items) {
      item.baseCanvas = ImageProcessor.processResultImage(item.image, options);
      item.processedCanvas = ImageProcessor.applyWatermark(item.baseCanvas, options.watermark);
    }
    renderResults();
    buildCollage();
  }

  function renderResults() {
    collagePanel.hidden = items.length === 0;

    const showIndividual = showIndividualCheckbox.checked;
    resultsPanel.hidden = !showIndividual;
    resultsList.innerHTML = "";
    if (!showIndividual) return;

    resultsEmpty.hidden = items.length > 0;

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "result-card";

      const canvasEl = item.processedCanvas;
      card.appendChild(canvasEl);

      const nameEl = document.createElement("p");
      nameEl.className = "result-filename";
      nameEl.textContent = item.fileName;
      card.appendChild(nameEl);

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.textContent = "ダウンロード";
      downloadBtn.addEventListener("click", () => downloadCanvas(canvasEl, `popn_result_${item.id}.png`));
      card.appendChild(downloadBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-button";
      removeBtn.textContent = "削除";
      removeBtn.addEventListener("click", () => removeItem(item.id));
      card.appendChild(removeBtn);

      resultsList.appendChild(card);
    }
  }

  function removeItem(id) {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items.splice(index, 1);
    renderResults();
    buildCollage();
  }

  function downloadCanvas(canvas, fileName) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function buildCollage() {
    // 集約画像は個々の画像の透かしではなく、集約後の1枚に対して透かしを1つだけ付ける
    const canvases = items.map((item) => item.baseCanvas).filter(Boolean);
    const rawCollageCanvas = Collage.buildCollage(canvases);
    collagePreview.innerHTML = "";
    if (!rawCollageCanvas) return;

    const collageCanvas = ImageProcessor.applyWatermark(rawCollageCanvas, getProcessOptions().watermark);
    collagePreview.appendChild(collageCanvas);

    const link = document.createElement("a");
    link.className = "download-link file-select-button";
    link.textContent = "集約画像をダウンロード";
    link.href = "#";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      downloadCanvas(collageCanvas, "popn_result_collage.png");
    });
    collagePreview.appendChild(link);
  }

  // --- イベント登録 ---
  fileInput.addEventListener("change", (e) => addFiles(e.target.files));

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    addFiles(e.dataTransfer.files);
  });

  maskDateCheckbox.addEventListener("change", handleOptionChange);
  maskUsernameCheckbox.addEventListener("change", handleOptionChange);
  rearrangeCheckbox.addEventListener("change", handleOptionChange);
  watermarkCheckbox.addEventListener("change", handleOptionChange);
  showIndividualCheckbox.addEventListener("change", handleDisplayOptionChange);

  // 前回保存されたオプションを復元してから初期描画する
  loadOptions();
})();
