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

  let previewTimer = null;
  let latestDownloads = {};

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
      unit: formData.get("unit"),
      exportFormat: overrideFormat || formData.get("exportFormat"),
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
    summaryText.textContent = `${previewData.boxTypeLabel} em ${(materialLabels[previewData.materialType] || "material").toLowerCase()}, com ${previewData.jointTypeLabel.toLowerCase()}, ${previewData.width.toFixed(0)} x ${previewData.height.toFixed(0)} x ${previewData.depth.toFixed(0)} mm.`;
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
      const data = await postJson("/api/preview-data", getPayload());
      const previewData = { ...data.preview, materialType: getPayload().materialType };
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
      const previewData = { ...data.preview, materialType: payload.materialType };
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
    document.getElementById("width").value = "180";
    document.getElementById("height").value = "120";
    document.getElementById("depth").value = "140";
    document.getElementById("thickness").value = "3";
    document.getElementById("kerf").value = "0.12";
    document.getElementById("tolerance").value = "0.1";
    latestDownloads = {};
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

  refreshPreview();
});
