window.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("boxForm");
  const previewButton = document.getElementById("previewButton");
  const generateButton = document.getElementById("generateButton");
  const downloadSvgButton = document.getElementById("downloadSvgButton");
  const downloadDxfButton = document.getElementById("downloadDxfButton");
  const downloadPdfButton = document.getElementById("downloadPdfButton");
  const resetButton = document.getElementById("resetButton");
  const statusBox = document.getElementById("statusBox");
  const volumeStat = document.getElementById("volumeStat");
  const panelStat = document.getElementById("panelStat");
  const materialStat = document.getElementById("materialStat");
  const summaryText = document.getElementById("summaryText");
  const fileHint = document.getElementById("fileHint");
  const previewModeInput = document.getElementById("previewMode");
  const previewModeButtons = document.querySelectorAll("[data-preview-mode]");
  const previewModeNote = document.getElementById("previewModeNote");
  const explodeControl = document.getElementById("explodeControl");
  const explodeSlider = document.getElementById("explodeSlider");
  const explodeValue = document.getElementById("explodeValue");

  const preview = new window.WiseBoxPreview("previewCanvas");
  const presets = {
    mdf3: { materialType: "mdf", thickness: 3, kerf: 0.12, tolerance: 0.1 },
    mdf6: { materialType: "mdf", thickness: 6, kerf: 0.16, tolerance: 0.15 },
    acrylic3: { materialType: "acrylic", thickness: 3, kerf: 0.08, tolerance: 0.08 },
  };
  const materialLabels = {
    mdf: "MDF",
    plywood: "Compensado",
    acrylic: "Acrilico",
    cardboard: "Papelao",
  };
  const previewModeLabels = {
    assembled: "Montada",
    exploded: "Explodida",
    flat: "Pecas",
  };
  const previewModeNotes = {
    assembled: "Modo montado mostra a caixa final. Encaixes ocultos pelo fechamento nao sao forçados visualmente.",
    exploded: "Modo explodido separa tampa, fundo e laterais para revelar encaixes escondidos sem distorcer o conjunto.",
    flat: "Modo pecas mostra os painéis separados, com o contorno real de corte e todos os encaixes visíveis.",
  };

  let previewTimer = null;
  let latestDownloads = {};
  let latestPreviewBase = null;

  function getPayload(overrideFormat) {
    const formData = new FormData(form);
    return {
      boxType: formData.get("boxType"),
      width: formData.get("width"),
      height: formData.get("height"),
      depth: formData.get("depth"),
      thickness: formData.get("thickness"),
      kerf: formData.get("kerf"),
      tolerance: formData.get("tolerance"),
      jointType: formData.get("jointType"),
      materialType: formData.get("materialType"),
      previewMode: formData.get("previewMode"),
      unit: formData.get("unit"),
      exportFormat: overrideFormat || formData.get("exportFormat"),
    };
  }

  function getExplodeFactor() {
    return Number(explodeSlider.value) / 100;
  }

  function updateExplodeControl() {
    const isExploded = previewModeInput.value === "exploded";
    explodeSlider.disabled = !isExploded;
    explodeControl.classList.toggle("is-active", isExploded);
    explodeValue.textContent = `${explodeSlider.value}%`;
  }

  function buildPreviewData(previewBase, payload) {
    return {
      ...previewBase,
      materialType: payload.materialType,
      previewMode: payload.previewMode,
      explodeFactor: getExplodeFactor(),
    };
  }

  function setStatus(message, tone) {
    statusBox.textContent = message;
    statusBox.classList.remove("is-error", "is-success");
    if (tone) statusBox.classList.add(tone);
  }

  function updateStats(previewData, panels) {
    const volumeCm3 = (previewData.width * previewData.height * previewData.depth) / 1000;
    volumeStat.textContent = `${volumeCm3.toFixed(1)} cm3`;
    panelStat.textContent = String(panels || estimatePanelCount(previewData.boxType));
    materialStat.textContent = `${materialLabels[previewData.materialType] || "Material"} ${previewData.thickness.toFixed(2)} mm`;
    summaryText.textContent = `${previewModeLabels[previewData.previewMode] || "Montada"}: ${previewData.boxTypeLabel} em ${(materialLabels[previewData.materialType] || "material").toLowerCase()}, com ${previewData.jointTypeLabel.toLowerCase()}, ${previewData.width.toFixed(0)} x ${previewData.height.toFixed(0)} x ${previewData.depth.toFixed(0)} mm.`;
    previewModeNote.textContent = previewModeNotes[previewData.previewMode] || previewModeNotes.assembled;
  }

  function estimatePanelCount(boxType) {
    if (boxType === "drawer") return 10;
    if (boxType === "open_box" || boxType === "tray") return 5;
    return 6;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text.slice(0, 180) || "Resposta invalida do servidor.");
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Falha na requisicao.");
    }
    return data;
  }

  async function refreshPreview() {
    try {
      const payload = getPayload();
      const data = await postJson("/api/preview-data", payload);
      latestPreviewBase = data.preview;
      const previewData = buildPreviewData(data.preview, payload);
      preview.setData(previewData);
      updateStats(previewData);
      setStatus("Preview atualizado com sucesso.", "is-success");
    } catch (error) {
      setStatus(error.message, "is-error");
    }
  }

  async function generateFile(requestedFormat, downloadAfterCreate) {
    try {
      setStatus(`Gerando ${requestedFormat.toUpperCase()}...`);
      const payload = getPayload(requestedFormat);
      const data = await postJson("/api/generate", payload);
      latestDownloads[requestedFormat] = data.downloadUrl;
      latestPreviewBase = data.preview;
      const previewData = buildPreviewData(data.preview, payload);
      preview.setData(previewData);
      updateStats(previewData, data.panels.length);
      fileHint.textContent = `Ultimo arquivo: ${data.filename} (${data.engine}).`;
      setStatus(`Arquivo ${requestedFormat.toUpperCase()} gerado com sucesso.`, "is-success");
      if (downloadAfterCreate) {
        window.location.href = data.downloadUrl;
      }
    } catch (error) {
      setStatus(error.message, "is-error");
    }
  }

  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(refreshPreview, 280);
  }

  form.addEventListener("input", schedulePreview);
  form.addEventListener("change", schedulePreview);

  previewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedMode = button.dataset.previewMode;
      previewModeInput.value = selectedMode;
      previewModeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      updateExplodeControl();
      refreshPreview();
    });
  });

  explodeSlider.addEventListener("input", () => {
    updateExplodeControl();
    if (!latestPreviewBase || previewModeInput.value !== "exploded") {
      return;
    }
    const payload = getPayload();
    const previewData = buildPreviewData(latestPreviewBase, payload);
    preview.setData(previewData);
    updateStats(previewData);
  });

  previewButton.addEventListener("click", refreshPreview);
  generateButton.addEventListener("click", () => {
    const format = document.getElementById("exportFormat").value;
    generateFile(format, false);
  });

  downloadSvgButton.addEventListener("click", () => generateFile("svg", true));
  downloadDxfButton.addEventListener("click", () => generateFile("dxf", true));
  downloadPdfButton.addEventListener("click", () => generateFile("pdf", true));

  resetButton.addEventListener("click", () => {
    form.reset();
    document.getElementById("boxType").value = "closed_box";
    document.getElementById("exportFormat").value = "svg";
    document.getElementById("jointType").value = "finger";
    document.getElementById("materialType").value = "mdf";
    previewModeInput.value = "assembled";
    previewModeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.previewMode === "assembled"));
    explodeSlider.value = "100";
    document.getElementById("width").value = "180";
    document.getElementById("height").value = "120";
    document.getElementById("depth").value = "140";
    document.getElementById("thickness").value = "3";
    document.getElementById("kerf").value = "0.12";
    document.getElementById("tolerance").value = "0.1";
    latestDownloads = {};
    latestPreviewBase = null;
    updateExplodeControl();
    fileHint.textContent = 'Use "Gerar Arquivo" para criar o formato selecionado.';
    refreshPreview();
  });

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = presets[button.dataset.preset];
      document.getElementById("materialType").value = preset.materialType;
      document.getElementById("thickness").value = preset.thickness;
      document.getElementById("kerf").value = preset.kerf;
      document.getElementById("tolerance").value = preset.tolerance;
      refreshPreview();
    });
  });

  updateExplodeControl();
  refreshPreview();
});
