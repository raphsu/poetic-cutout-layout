import { removeBackground } from "@imgly/background-removal";
import { toPng } from "html-to-image";
import { saveImage } from "./main.js";

// 摳圖模型比純顯示吃資源，上限比詩意摳圖那邊（1800）再降一點，換取速度。
const MAX_IMAGE_DIM = 1400;
const EXPORT_WIDTH = 1200;

const state = {
  imgEl: null,
  imgSrc: null,
  cutoutCanvas: null, // 摳圖後裁到主體邊界的 canvas（保留原始 RGBA，濾鏡都從這裡重繪）
  cutoutAspect: 1,
  silBaked: { solid: null, pixelate: null, halftone: null, watercolor: null }, // 已上色/上材質的剪影，data URL
  filter: "solid",
  swap: false,
  split: 48,
  subjectOverText: false,
  silScale: 78,
  silX: 58,
  silY: 6, // 剪影底部相對分割線的偏移（百分點）：正值探進另一色塊，負值縮回原本那側
  subjScale: 82,
  subjX: 4,
  bgColor: "#f2c744",
  silColor: "#2f6f6d",
  fontFamily: "Inter, sans-serif",
  fontSize: 22,
  textColor: "#111111",
  row1Left: "",
  row1Right: "",
  row2Left: "",
  row2Right: "",
  palette: [],
  photoZoom: 1,
  panU: 0, // -1..1，可挪移範圍的比例
  panV: 0,
};

const els = {
  tabPoetic: document.getElementById("tab-poetic"),
  tabSilhouette: document.getElementById("tab-silhouette"),
  modePoetic: document.getElementById("mode-poetic"),
  modeSilhouette: document.getElementById("mode-silhouette"),

  dropzone: document.getElementById("dropzone-2"),
  fileInput: document.getElementById("file-input-2"),
  status: document.getElementById("sil-status"),
  photoZoomInput: document.getElementById("input-sil-photo-zoom"),
  photoZoomVal: document.getElementById("val-sil-photo-zoom"),

  filterButtons: [...document.querySelectorAll("#sil-filter-group button")],

  bgColorInput: document.getElementById("input-bg-color"),
  bgColorText: document.getElementById("bg-color-text-2"),
  silColorInput: document.getElementById("input-sil-color"),
  silColorText: document.getElementById("sil-color-text"),
  swatches: document.getElementById("sil-swatches"),

  swapBtn: document.getElementById("btn-swap"),
  splitInput: document.getElementById("input-split"),
  splitVal: document.getElementById("val-split"),
  subjectOverInput: document.getElementById("input-subject-over"),
  silScaleInput: document.getElementById("input-sil-scale"),
  silScaleVal: document.getElementById("val-sil-scale"),
  silXInput: document.getElementById("input-sil-x"),
  silXVal: document.getElementById("val-sil-x"),
  silYInput: document.getElementById("input-sil-y"),
  silYVal: document.getElementById("val-sil-y"),
  subjScaleInput: document.getElementById("input-subj-scale"),
  subjScaleVal: document.getElementById("val-subj-scale"),
  subjXInput: document.getElementById("input-subj-x"),
  subjXVal: document.getElementById("val-subj-x"),

  row1LeftInput: document.getElementById("input-row1-left"),
  row1RightInput: document.getElementById("input-row1-right"),
  row2LeftInput: document.getElementById("input-row2-left"),
  row2RightInput: document.getElementById("input-row2-right"),
  fillColorCodeBtn: document.getElementById("btn-fill-colorcode"),
  fontSelect: document.getElementById("select-sil-font"),
  fontSizeInput: document.getElementById("input-sil-fontsize"),
  fontSizeVal: document.getElementById("val-sil-fontsize"),
  textColorInput: document.getElementById("input-sil-textcolor"),
  textColorText: document.getElementById("sil-textcolor-text"),

  exportBtn: document.getElementById("btn-export-2"),

  card: document.getElementById("canvas-card-2"),
  photoBand: document.getElementById("sil-photo-band"),
  sourceImg: document.getElementById("sil-source-img"),
  solidBand: document.getElementById("sil-solid-band"),
  silhouette: document.getElementById("sil-silhouette"),
  textLayer: document.getElementById("sil-text-layer"),
  row1: document.getElementById("sil-row1"),
  row2: document.getElementById("sil-row2"),
  subject: document.getElementById("sil-subject-img"),
  empty: document.getElementById("sil-empty"),
};

init();

function init() {
  bindTabs();
  bindUpload();
  bindControls();
  bindPhotoPan();
  applyColorVars();
  renderBands();
  renderText();
  updateEmptyState();
  window.addEventListener("resize", applyPhotoTransform);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* ---------- 分頁切換 ---------- */

function bindTabs() {
  els.tabPoetic.addEventListener("click", () => {
    els.tabPoetic.classList.add("active");
    els.tabSilhouette.classList.remove("active");
    els.modePoetic.classList.remove("mode-hidden");
    els.modeSilhouette.classList.add("mode-hidden");
  });
  els.tabSilhouette.addEventListener("click", () => {
    els.tabSilhouette.classList.add("active");
    els.tabPoetic.classList.remove("active");
    els.modeSilhouette.classList.remove("mode-hidden");
    els.modePoetic.classList.add("mode-hidden");
  });
}

/* ---------- 上傳 ---------- */

function bindUpload() {
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  els.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // 只在這個分頁顯示時接手貼上，避免跟「詩意摳圖」那邊的貼上互搶同一張圖。
  window.addEventListener("paste", (e) => {
    if (els.modeSilhouette.classList.contains("mode-hidden")) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        handleFile(item.getAsFile());
        break;
      }
    }
  });
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rawImg = new Image();
    rawImg.onload = () => {
      const longEdge = Math.max(rawImg.width, rawImg.height);
      if (longEdge <= MAX_IMAGE_DIM) {
        processImage(rawImg, reader.result, file.name);
        return;
      }
      const scale = MAX_IMAGE_DIM / longEdge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rawImg.width * scale);
      canvas.height = Math.round(rawImg.height * scale);
      canvas.getContext("2d").drawImage(rawImg, 0, 0, canvas.width, canvas.height);
      const resizedSrc = canvas.toDataURL("image/jpeg", 0.92);
      const resizedImg = new Image();
      resizedImg.onload = () => processImage(resizedImg, resizedSrc, file.name);
      resizedImg.src = resizedSrc;
    };
    rawImg.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function processImage(img, src, filename) {
  state.imgEl = img;
  state.imgSrc = src;
  state.cutoutCanvas = null;
  state.silBaked = { solid: null, pixelate: null, halftone: null, watercolor: null };
  state.photoZoom = 1;
  state.panU = 0;
  state.panV = 0;
  els.photoZoomInput.value = 100;
  els.photoZoomVal.textContent = "100%";

  els.sourceImg.src = src;
  els.dropzone.classList.add("has-image");
  els.dropzone.querySelector("p").textContent = filename;
  updateEmptyState();

  state.palette = extractPalette(img);
  renderSwatches();
  if (state.palette[0]) {
    state.bgColor = state.palette[0].hex;
    els.bgColorInput.value = state.bgColor;
    els.bgColorText.textContent = state.bgColor;
  }
  if (state.palette[3]) {
    state.silColor = state.palette[3].hex;
    els.silColorInput.value = state.silColor;
    els.silColorText.textContent = state.silColor;
  }
  applyColorVars();

  applyPhotoTransform();
  renderSilhouette();
  renderSubject();

  await runBackgroundRemoval(src);
}

function updateEmptyState() {
  els.empty.style.display = state.imgEl ? "none" : "flex";
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.classList.toggle("show", Boolean(text));
  els.status.classList.remove("status-loading", "status-done", "status-error");
  if (kind) els.status.classList.add("status-" + kind);
}

async function runBackgroundRemoval(src) {
  setStatus("正在自動摳圖…第一次使用需下載 AI 模型（依網速可能需要 10-60 秒）", "loading");
  try {
    const blob = await removeBackground(src, {
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (key, current, total) => {
        if (total) setStatus(`下載模型中… ${key} ${((current / total) * 100).toFixed(0)}%`, "loading");
      },
    });
    const url = URL.createObjectURL(blob);
    const cutImg = await loadImage(url);
    const cropped = cropToOpaqueBounds(cutImg);
    URL.revokeObjectURL(url);
    if (!cropped) throw new Error("找不到主體，請換一張人物更明顯的照片");

    state.cutoutCanvas = cropped;
    state.cutoutAspect = cropped.width / cropped.height;
    recomputeSilhouetteBakes();
    setStatus("✅ 摳圖完成，可在下方調整版面", "done");
  } catch (err) {
    console.error(err);
    setStatus("⚠️ 自動摳圖失敗：" + (err?.message || String(err)) + "（版面仍可調整，但沒有摳圖效果）", "error");
  } finally {
    renderSilhouette();
    renderSubject();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------- 摳圖裁邊 ---------- */

function cropToOpaqueBounds(imgEl) {
  const w = imgEl.naturalWidth;
  const h = imgEl.naturalHeight;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  sctx.drawImage(imgEl, 0, 0);
  const { data } = sctx.getImageData(0, 0, w, h);

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const rowBase = y * w;
    for (let x = 0; x < w; x++) {
      const a = data[(rowBase + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d").drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

/* ---------- 剪影上色／材質（在 canvas 上合成後烘成一張圖，匯出才不會因為即時 CSS 特效而失真） ---------- */

function bakeSolidSilhouette(cutoutCanvas, hexColor) {
  const { width: w, height: h } = cutoutCanvas;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(cutoutCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, w, h);
  return out;
}

function bakeTexturedSilhouette(cutoutCanvas, textureCanvas) {
  const { width: w, height: h } = cutoutCanvas;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(cutoutCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(textureCanvas, 0, 0, w, h);
  return out;
}

function makePixelated(canvas, blocks = 26) {
  const { width: w, height: h } = canvas;
  const scale = blocks / Math.max(w, h);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  small.getContext("2d").drawImage(canvas, 0, 0, sw, sh);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h);
  return out;
}

function makeHalftone(canvas, cell = 16) {
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext("2d").getImageData(0, 0, w, h);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");

  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const cx = Math.min(w - 1, x + (cell >> 1));
      const cy = Math.min(h - 1, y + (cell >> 1));
      const i = (cy * w + cx) * 4;
      const a = data[i + 3];
      if (a < 40) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const radius = (cell / 2) * (0.35 + (1 - lum) * 0.55) * (a / 255);
      octx.beginPath();
      octx.fillStyle = `rgb(${r},${g},${b})`;
      octx.arc(x + cell / 2, y + cell / 2, Math.max(1, radius), 0, Math.PI * 2);
      octx.fill();
    }
  }
  return out;
}

// 水彩：先把摳圖的 RGBA 整張模糊（連 alpha 邊界一起暈開，才會有顏料暈染的軟邊，
// 不是規則的柔邊陰影），再撒一些從畫面取樣顏色的軟邊色斑補一點筆觸感，最後把
// 「半透明的過渡像素」（也就是暈開的那圈）加深，模擬顏料在筆觸邊界堆積變深的效果。
// 這個濾鏡本身就帶軟邊 alpha，不能再用 source-in 裁回原本銳利的輪廓，
// 否則暈染效果會被整圈裁掉——跟像素化／網點濾鏡的處理方式不同。
function makeWatercolor(cutoutCanvas) {
  const { width: w, height: h } = cutoutCanvas;

  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  const bctx = base.getContext("2d");
  bctx.filter = "blur(2.2px) saturate(1.2) contrast(0.95)";
  bctx.drawImage(cutoutCanvas, 0, 0);
  bctx.filter = "none";

  const { data: sampleData } = bctx.getImageData(0, 0, w, h);
  const dabCount = Math.round((w * h) / 700);
  for (let i = 0; i < dabCount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const px = (Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)) * 4;
    const a = sampleData[px + 3];
    if (a < 30) continue;
    const r = sampleData[px], g = sampleData[px + 1], b = sampleData[px + 2];
    const radius = 6 + Math.random() * 14;
    const grad = bctx.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.08 + Math.random() * 0.14;
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    bctx.fillStyle = grad;
    bctx.beginPath();
    bctx.arc(x, y, radius, 0, Math.PI * 2);
    bctx.fill();
  }

  const edgeDarken = 0.35;
  const imgData = bctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= 0 || a >= 250) continue; // 只處理模糊後半透明的那圈過渡像素
    const t = a / 255;
    const edgeFactor = 1 - Math.abs(t - 0.5) * 2; // 愈接近半透明（a≈128）愈強
    const darken = 1 - edgeDarken * edgeFactor;
    data[i] *= darken;
    data[i + 1] *= darken;
    data[i + 2] *= darken;
  }
  bctx.putImageData(imgData, 0, 0);

  return base;
}

function recomputeSilhouetteBakes() {
  if (!state.cutoutCanvas) {
    state.silBaked = { solid: null, pixelate: null, halftone: null, watercolor: null };
    return;
  }
  state.silBaked.solid = bakeSolidSilhouette(state.cutoutCanvas, state.silColor).toDataURL("image/png");
  if (!state.silBaked.pixelate) {
    state.silBaked.pixelate = bakeTexturedSilhouette(state.cutoutCanvas, makePixelated(state.cutoutCanvas)).toDataURL("image/png");
  }
  if (!state.silBaked.halftone) {
    state.silBaked.halftone = bakeTexturedSilhouette(state.cutoutCanvas, makeHalftone(state.cutoutCanvas)).toDataURL("image/png");
  }
  if (!state.silBaked.watercolor) {
    state.silBaked.watercolor = makeWatercolor(state.cutoutCanvas).toDataURL("image/png");
  }
}

/* ---------- 智能提色 ---------- */

function extractPalette(imgEl) {
  const SAMPLE = 48;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = [(r >> 4) << 4, (g >> 4) << 4, (b >> 4) << 4].join(",");
    const entry = buckets.get(key);
    if (entry) entry.count++;
    else buckets.set(key, { r, g, b, count: 1 });
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);

  const dominant = [];
  for (const c of sorted) {
    if (dominant.length >= 3) break;
    // 跳過跟已選色太接近的桶，色調單純的照片才不會三個都長一樣
    const tooClose = dominant.some((d) => colorDistance(d, c) < 40);
    if (!tooClose) dominant.push(c);
  }
  while (dominant.length < 3 && sorted.length) dominant.push(sorted[dominant.length % sorted.length]);

  const complementary = dominant.map(complementaryColor);
  return [...dominant, ...complementary].map((c) => ({ hex: rgbToHex(c.r, c.g, c.b) }));
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function complementaryColor({ r, g, b }) {
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToRgb((h + 180) % 360, s, l);
}

function renderSwatches() {
  els.swatches.innerHTML = "";
  state.palette.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.background = c.hex;
    btn.title = c.hex + "（點擊套用到背景色，按住 Shift 套用到剪影色）";
    btn.addEventListener("click", (e) => {
      if (e.shiftKey) {
        state.silColor = c.hex;
        els.silColorInput.value = state.silColor;
        els.silColorText.textContent = state.silColor;
        recomputeSilhouetteBakes();
        renderSilhouette();
      } else {
        state.bgColor = c.hex;
        els.bgColorInput.value = state.bgColor;
        els.bgColorText.textContent = state.bgColor;
      }
      applyColorVars();
    });
    els.swatches.appendChild(btn);
  });
}

/* ---------- 版面控制項 ---------- */

function bindControls() {
  els.photoZoomInput.addEventListener("input", () => {
    state.photoZoom = Number(els.photoZoomInput.value) / 100;
    els.photoZoomVal.textContent = els.photoZoomInput.value + "%";
    applyPhotoTransform();
  });

  els.filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      els.filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
      renderSilhouette();
    });
  });

  els.swapBtn.addEventListener("click", () => {
    state.swap = !state.swap;
    els.swapBtn.classList.toggle("active", state.swap);
    renderBands();
  });

  els.splitInput.addEventListener("input", () => {
    state.split = Number(els.splitInput.value);
    els.splitVal.textContent = state.split + "%";
    renderBands();
    renderSilhouette();
    renderText();
  });

  els.subjectOverInput.addEventListener("change", () => {
    state.subjectOverText = els.subjectOverInput.checked;
    renderSubject();
    renderText();
  });

  els.silScaleInput.addEventListener("input", () => {
    state.silScale = Number(els.silScaleInput.value);
    els.silScaleVal.textContent = state.silScale + "%";
    renderSilhouette();
  });
  els.silXInput.addEventListener("input", () => {
    state.silX = Number(els.silXInput.value);
    els.silXVal.textContent = state.silX + "%";
    renderSilhouette();
  });
  els.silYInput.addEventListener("input", () => {
    state.silY = Number(els.silYInput.value);
    els.silYVal.textContent = (state.silY >= 0 ? "+" : "") + state.silY + "%";
    renderSilhouette();
  });
  els.subjScaleInput.addEventListener("input", () => {
    state.subjScale = Number(els.subjScaleInput.value);
    els.subjScaleVal.textContent = state.subjScale + "%";
    renderSubject();
  });
  els.subjXInput.addEventListener("input", () => {
    state.subjX = Number(els.subjXInput.value);
    els.subjXVal.textContent = state.subjX + "%";
    renderSubject();
  });

  els.bgColorInput.addEventListener("input", () => {
    state.bgColor = els.bgColorInput.value;
    els.bgColorText.textContent = state.bgColor;
    applyColorVars();
  });
  els.silColorInput.addEventListener("input", () => {
    state.silColor = els.silColorInput.value;
    els.silColorText.textContent = state.silColor;
    recomputeSilhouetteBakes();
    renderSilhouette();
  });

  [els.row1LeftInput, els.row1RightInput, els.row2LeftInput, els.row2RightInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.row1Left = els.row1LeftInput.value;
      state.row1Right = els.row1RightInput.value;
      state.row2Left = els.row2LeftInput.value;
      state.row2Right = els.row2RightInput.value;
      renderText();
    });
  });

  els.fillColorCodeBtn.addEventListener("click", () => {
    els.row2RightInput.value = `${state.bgColor} · ${state.silColor}`;
    state.row2Right = els.row2RightInput.value;
    renderText();
  });

  els.fontSelect.addEventListener("change", () => {
    state.fontFamily = els.fontSelect.value;
    applyColorVars();
  });
  els.fontSizeInput.addEventListener("input", () => {
    state.fontSize = Number(els.fontSizeInput.value);
    els.fontSizeVal.textContent = state.fontSize + "px";
    applyColorVars();
  });
  els.textColorInput.addEventListener("input", () => {
    state.textColor = els.textColorInput.value;
    els.textColorText.textContent = state.textColor;
    applyColorVars();
  });

  els.exportBtn.addEventListener("click", exportImage);
}

/* ---------- 渲染 ---------- */

function applyColorVars() {
  els.card.style.setProperty("--sil-bg-color", state.bgColor);
  els.textLayer.style.setProperty("--sil-font-family", state.fontFamily);
  els.textLayer.style.setProperty("--sil-font-size", state.fontSize + "px");
  els.textLayer.style.setProperty("--sil-text-color", state.textColor);
}

function renderBands() {
  const topH = state.split;
  const bottomH = 100 - state.split;
  if (!state.swap) {
    Object.assign(els.photoBand.style, { top: "0%", bottom: "", height: topH + "%" });
    Object.assign(els.solidBand.style, { top: "", bottom: "0%", height: bottomH + "%" });
  } else {
    Object.assign(els.photoBand.style, { top: "", bottom: "0%", height: bottomH + "%" });
    Object.assign(els.solidBand.style, { top: "0%", bottom: "", height: topH + "%" });
  }
  // 分割線一動，照片區容器的尺寸就變了，取景幾何要重算才不會跑位。
  applyPhotoTransform();
}

/* ---------- 背景照片縮放／拖曳取景（跟「詩意摳圖」下半部同一套邏輯） ---------- */

function getPhotoGeometry() {
  const containerRect = els.photoBand.getBoundingClientRect();
  const iw = state.imgEl?.naturalWidth;
  const ih = state.imgEl?.naturalHeight;
  if (!iw || !ih || !containerRect.width || !containerRect.height) return null;
  const baseScale = Math.max(containerRect.width / iw, containerRect.height / ih);
  const scale = baseScale * state.photoZoom;
  const dispW = iw * scale;
  const dispH = ih * scale;
  const maxOffX = Math.abs(dispW - containerRect.width) / 2;
  const maxOffY = Math.abs(dispH - containerRect.height) / 2;
  const offX = (containerRect.width - dispW) / 2 + state.panU * maxOffX;
  const offY = (containerRect.height - dispH) / 2 + state.panV * maxOffY;
  return { dispW, dispH, offX, offY, maxOffX, maxOffY };
}

function applyPhotoTransform() {
  const geom = getPhotoGeometry();
  if (!geom) return;
  els.sourceImg.style.width = geom.dispW + "px";
  els.sourceImg.style.height = geom.dispH + "px";
  els.sourceImg.style.left = geom.offX + "px";
  els.sourceImg.style.top = geom.offY + "px";
}

function bindPhotoPan() {
  els.photoBand.addEventListener("pointerdown", (e) => {
    if (!state.imgEl) return;
    const geom = getPhotoGeometry();
    if (!geom) return;
    els.photoBand.setPointerCapture(e.pointerId);
    els.photoBand.classList.add("panning");
    const startX = e.clientX;
    const startY = e.clientY;
    const startU = state.panU;
    const startV = state.panV;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      state.panU = clamp(startU + (geom.maxOffX > 0 ? dx / geom.maxOffX : 0), -1, 1);
      state.panV = clamp(startV + (geom.maxOffY > 0 ? dy / geom.maxOffY : 0), -1, 1);
      applyPhotoTransform();
    }
    function onUp(ev) {
      els.photoBand.releasePointerCapture(ev.pointerId);
      els.photoBand.classList.remove("panning");
      els.photoBand.removeEventListener("pointermove", onMove);
      els.photoBand.removeEventListener("pointerup", onUp);
    }
    els.photoBand.addEventListener("pointermove", onMove);
    els.photoBand.addEventListener("pointerup", onUp);
  });
}

function renderSilhouette() {
  const el = els.silhouette;
  const src = state.silBaked[state.filter];
  if (!src) {
    el.style.display = "none";
    return;
  }
  el.src = src;
  el.style.display = "block";
  el.style.height = state.silScale + "%";
  el.style.left = state.silX + "%";
  el.style.transform = "translateX(-50%)";
  // 分割線固定在「距頂 split%」，跟上下互換無關；剪影底部再依 silY 探進/縮出另一色塊。
  el.style.bottom = clamp(100 - state.split - state.silY, 0, 94) + "%";
}

function renderSubject() {
  const el = els.subject;
  if (!state.cutoutCanvas) {
    el.style.display = "none";
    return;
  }
  el.src = state.cutoutCanvas.toDataURL("image/png");
  el.style.display = "block";
  el.style.height = state.subjScale + "%";
  el.style.left = state.subjX + "%";
  el.style.bottom = "2%";
  el.style.zIndex = state.subjectOverText ? "5" : "3";
  els.textLayer.style.zIndex = state.subjectOverText ? "4" : "5";
}

function renderText() {
  els.textLayer.style.top = state.split + "%";
  els.textLayer.style.transform = "translateY(-50%)";
  buildRow(els.row1, state.row1Left || els.row1LeftInput.placeholder, state.row1Right || els.row1RightInput.placeholder);
  buildRow(els.row2, state.row2Left || els.row2LeftInput.placeholder, state.row2Right || els.row2RightInput.placeholder);
}

function buildRow(container, left, right) {
  container.innerHTML = "";
  const text = [left, right].filter(Boolean).join(" · ");
  const tokens = text.split(/\s+/).filter(Boolean);
  tokens.forEach((tok) => {
    const span = document.createElement("span");
    span.textContent = tok;
    if (tok === "·") span.classList.add("dot");
    container.appendChild(span);
  });
}

/* ---------- 匯出 ---------- */

async function exportImage() {
  if (!state.imgEl) {
    alert("請先上傳一張照片");
    return;
  }
  els.exportBtn.disabled = true;
  const original = els.exportBtn.textContent;
  els.exportBtn.textContent = "匯出中...";
  try {
    const rect = els.card.getBoundingClientRect();
    const pixelRatio = EXPORT_WIDTH / rect.width;
    const dataUrl = await toPng(els.card, { pixelRatio, cacheBust: true, skipFonts: true });
    await saveImage(dataUrl, "silhouette-layout.png");
  } catch (err) {
    if (err?.code === "declined") return;
    console.error(err);
    alert("匯出失敗：" + (err?.message || err?.code || err));
  } finally {
    els.exportBtn.disabled = false;
    els.exportBtn.textContent = original;
  }
}
