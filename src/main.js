import { toPng } from "html-to-image";

const DEMO_CAPTIONS = [
  { text: "A kaleidoscope of painted wings dances across the vast and tranquil cerulean sky.", tone: "cool", brightness: "bright" },
  { text: "Warm lanterns glow like luminous blossoms against the cool indigo of a deepening sky.", tone: "warm", brightness: "dark" },
  { text: "With fingers plucking silk behind her back, she weaves silent melodies into the gilded dust of eternity.", tone: "warm", brightness: "dark" },
  { text: "Morning light spills through the quiet leaves, gathering gold in every trembling shadow.", tone: "warm", brightness: "bright" },
  { text: "The city breathes in neon, exhaling a thousand small and restless dreams.", tone: "cool", brightness: "dark" },
  { text: "Waves fold over waves, carrying the low hush of a coastline that forgets nothing.", tone: "cool", brightness: "bright" },
  { text: "Between the mountains and the mist, a single road unravels toward the unknown.", tone: "neutral", brightness: "dark" },
  { text: "Petals scatter like whispered secrets across the still, indifferent water.", tone: "neutral", brightness: "bright" },
];

const BRACKETS = {
  curly: ["{", "}"],
  round: ["(", ")"],
  square: ["[", "]"],
  none: ["", ""],
};

const RATIO_PRESETS = {
  "3:4": [3, 4],
  "1:1": [1, 1],
  "4:5": [4, 5],
  "9:16": [9, 16],
  "16:9": [16, 9],
};

const EXPORT_BASE_WIDTH = 1200;

const state = {
  imgEl: null,
  imgSrc: null,
  caption: "",
  rects: [], // {xPct, yPct, wPct, hPct} in % of bottom-panel container
  count: 6,
  scale: 2.0,
  fontSize: 32,
  fontFamily: "Inter, sans-serif",
  bracket: "round",
  bgColor: "#ebebeb",
  textColor: "#111111",
  locked: false,
  captionIndex: -1,
  geminiModel: null,
  ratio: "3:4",
  topRatio: 47,
  photoZoom: 1,
  panU: 0, // -1..1, fraction of available pan slack
  panV: 0,
  showRulers: false,
  guides: [], // {axis:'x'|'y', pos} pos 是 0..1 的比例，換比例時才不會跑掉
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  captionInput: document.getElementById("caption-input"),
  btnAiGen: document.getElementById("btn-ai-gen"),
  apiKeyInput: document.getElementById("input-api-key"),
  btnLock: document.getElementById("btn-lock"),
  btnRandomize: document.getElementById("btn-randomize"),
  inputCount: document.getElementById("input-count"),
  valCount: document.getElementById("val-count"),
  inputScale: document.getElementById("input-scale"),
  valScale: document.getElementById("val-scale"),
  inputFontSize: document.getElementById("input-font-size"),
  valFontSize: document.getElementById("val-font-size"),
  selectFont: document.getElementById("select-font"),
  selectBrackets: document.getElementById("select-brackets"),
  selectRatio: document.getElementById("select-ratio"),
  canvasResLabel: document.getElementById("canvas-res-label"),
  inputPhotoZoom: document.getElementById("input-photo-zoom"),
  valPhotoZoom: document.getElementById("val-photo-zoom"),
  inputTopRatio: document.getElementById("input-top-ratio"),
  valTopRatio: document.getElementById("val-top-ratio"),
  canvasStage: document.getElementById("canvas-stage"),
  rulerTop: document.getElementById("ruler-top"),
  rulerLeft: document.getElementById("ruler-left"),
  guideLayer: document.getElementById("guide-layer"),
  btnToggleRulers: document.getElementById("btn-toggle-rulers"),
  btnGuideCenter: document.getElementById("btn-guide-center"),
  btnGuideThirds: document.getElementById("btn-guide-thirds"),
  btnGuideClear: document.getElementById("btn-guide-clear"),
  analysisTag: document.getElementById("analysis-tag"),
  bgColor: document.getElementById("bg-color"),
  bgColorText: document.getElementById("bg-color-text"),
  textColor: document.getElementById("text-color"),
  textColorText: document.getElementById("text-color-text"),
  btnExport: document.getElementById("btn-export"),
  canvasCard: document.getElementById("canvas-card"),
  topPanel: document.getElementById("top-panel"),
  poeticText: document.getElementById("poetic-text-container"),
  bottomPanel: document.getElementById("bottom-panel"),
  sourceImg: document.getElementById("source-img"),
  maskLayer: document.getElementById("mask-layer"),
};

init();

function init() {
  els.captionInput.value = "";
  state.caption = els.captionInput.placeholder;
  applyStyleVars();
  bindEvents();
  setRulersVisible(state.showRulers);
  applyCanvasRatio();
}

function applyStyleVars() {
  els.canvasCard.style.setProperty("--panel-bg", state.bgColor);
  els.canvasCard.style.setProperty("--panel-text", state.textColor);
  els.canvasCard.style.setProperty("--top-ratio", state.topRatio + "%");
  els.poeticText.style.setProperty("--poetic-font-size", state.fontSize + "px");
  els.poeticText.style.setProperty("--poetic-font-family", state.fontFamily);
}

function getRatioWH() {
  if (state.ratio === "photo" && state.imgEl) {
    return [state.imgEl.naturalWidth, state.imgEl.naturalHeight];
  }
  return RATIO_PRESETS[state.ratio] || RATIO_PRESETS["3:4"];
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function applyCanvasRatio() {
  const [w, h] = getRatioWH();
  els.canvasCard.style.aspectRatio = `${w} / ${h}`;

  const exportW = EXPORT_BASE_WIDTH;
  const exportH = Math.round((EXPORT_BASE_WIDTH * h) / w);
  let ratioLabel = state.ratio;
  if (state.ratio === "photo") {
    const d = gcd(w, h) || 1;
    ratioLabel = `${w / d}:${h / d}`;
  }
  els.canvasResLabel.textContent = `畫布解析度: ${exportW} x ${exportH} (${ratioLabel})`;
  els.btnExport.textContent = `📥 導出高清圖片 (${exportW}x${exportH}, ${ratioLabel})`;

  // Aspect ratio change reshapes the bottom-panel crop area, so the
  // background image and masks/chips need to re-measure against it.
  applyBackgroundTransform();
  renderPoeticText();
  updateRulers();
  renderGuides();
}

function bindEvents() {
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
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
    if (file) loadImageFile(file);
  });

  window.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        loadImageFile(item.getAsFile());
        break;
      }
    }
  });

  els.captionInput.addEventListener("input", () => {
    state.caption = els.captionInput.value.trim() || els.captionInput.placeholder;
    renderPoeticText();
  });

  els.btnAiGen.addEventListener("click", generateCaption);

  els.btnLock.addEventListener("click", () => {
    state.locked = !state.locked;
    els.btnLock.textContent = state.locked ? "\u{1F512} 已鎖定" : "\u{1F513} 未鎖定";
    els.btnLock.classList.toggle("active", state.locked);
  });

  els.btnRandomize.addEventListener("click", () => {
    generateRects(state.count);
    renderAll();
  });

  els.inputCount.addEventListener("input", () => {
    state.count = Number(els.inputCount.value);
    els.valCount.textContent = state.count;
    if (state.locked) {
      adjustRectsToCount(state.count);
    } else {
      generateRects(state.count);
    }
    renderAll();
  });

  els.inputScale.addEventListener("input", () => {
    state.scale = Number(els.inputScale.value);
    els.valScale.textContent = state.scale.toFixed(1) + "x";
    renderPoeticText();
  });

  els.inputFontSize.addEventListener("input", () => {
    state.fontSize = Number(els.inputFontSize.value);
    els.valFontSize.textContent = state.fontSize + "px";
    applyStyleVars();
    renderPoeticText();
  });

  els.selectFont.addEventListener("change", () => {
    state.fontFamily = els.selectFont.value;
    applyStyleVars();
  });

  els.selectBrackets.addEventListener("change", () => {
    state.bracket = els.selectBrackets.value;
    renderPoeticText();
  });

  els.selectRatio.addEventListener("change", () => {
    state.ratio = els.selectRatio.value;
    applyCanvasRatio();
  });

  els.bgColor.addEventListener("input", () => {
    state.bgColor = els.bgColor.value;
    els.bgColorText.textContent = state.bgColor;
    applyStyleVars();
  });

  els.textColor.addEventListener("input", () => {
    state.textColor = els.textColor.value;
    els.textColorText.textContent = state.textColor;
    applyStyleVars();
  });

  els.btnExport.addEventListener("click", exportImage);

  window.addEventListener("resize", () => renderAll());

  els.inputTopRatio.addEventListener("input", () => {
    state.topRatio = Number(els.inputTopRatio.value);
    els.valTopRatio.textContent = state.topRatio + "%";
    applyStyleVars();
    // 分割位置一動，下半部的取景區高度就變了，背景與小圖都要重算
    applyBackgroundTransform();
    renderPoeticText();
  });

  els.inputPhotoZoom.addEventListener("input", () => {
    state.photoZoom = Number(els.inputPhotoZoom.value) / 100;
    els.valPhotoZoom.textContent = els.inputPhotoZoom.value + "%";
    applyBackgroundTransform();
    renderPoeticText();
  });

  els.bottomPanel.addEventListener("pointerdown", startPan);

  // 上方尺標拉出水平線、左方尺標拉出垂直線（與一般設計工具的方向一致）
  els.rulerTop.addEventListener("pointerdown", (ev) => startGuideFromRuler(ev, "y"));
  els.rulerLeft.addEventListener("pointerdown", (ev) => startGuideFromRuler(ev, "x"));

  els.btnToggleRulers.addEventListener("click", () => setRulersVisible(!state.showRulers));

  els.btnGuideCenter.addEventListener("click", () =>
    addGuides([{ axis: "x", pos: 0.5 }, { axis: "y", pos: 0.5 }])
  );
  els.btnGuideThirds.addEventListener("click", () =>
    addGuides([
      { axis: "x", pos: 1 / 3 }, { axis: "x", pos: 2 / 3 },
      { axis: "y", pos: 1 / 3 }, { axis: "y", pos: 2 / 3 },
    ])
  );
  els.btnGuideClear.addEventListener("click", () => {
    state.guides = [];
    renderGuides();
  });
}

function startPan(e) {
  if (!state.imgEl) return;
  const geom = getCoverGeometry();
  if (!geom) return;
  els.bottomPanel.setPointerCapture(e.pointerId);
  els.bottomPanel.classList.add("panning");
  const startX = e.clientX;
  const startY = e.clientY;
  const startU = state.panU;
  const startV = state.panV;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    state.panU = clamp(startU + (geom.maxOffX > 0 ? dx / geom.maxOffX : 0), -1, 1);
    state.panV = clamp(startV + (geom.maxOffY > 0 ? dy / geom.maxOffY : 0), -1, 1);
    applyBackgroundTransform();
    renderPoeticText();
  }
  function onUp(ev) {
    els.bottomPanel.releasePointerCapture(ev.pointerId);
    els.bottomPanel.classList.remove("panning");
    els.bottomPanel.removeEventListener("pointermove", onMove);
    els.bottomPanel.removeEventListener("pointerup", onUp);
  }
  els.bottomPanel.addEventListener("pointermove", onMove);
  els.bottomPanel.addEventListener("pointerup", onUp);
}

const MAX_IMAGE_DIM = 1800;

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rawImg = new Image();
    rawImg.onload = () => {
      const longEdge = Math.max(rawImg.width, rawImg.height);
      if (longEdge <= MAX_IMAGE_DIM) {
        finalizeImage(rawImg, reader.result, file);
        return;
      }
      // Downscale large photos: keeps the crop/chip/export pipeline fast,
      // since html-to-image re-serializes every embedded copy of the source.
      const scale = MAX_IMAGE_DIM / longEdge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rawImg.width * scale);
      canvas.height = Math.round(rawImg.height * scale);
      canvas.getContext("2d").drawImage(rawImg, 0, 0, canvas.width, canvas.height);
      const resizedSrc = canvas.toDataURL("image/jpeg", 0.9);
      const resizedImg = new Image();
      resizedImg.onload = () => finalizeImage(resizedImg, resizedSrc, file);
      resizedImg.src = resizedSrc;
    };
    rawImg.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function finalizeImage(img, src, file) {
  state.imgEl = img;
  state.imgSrc = src;
  state.photoZoom = 1;
  state.panU = 0;
  state.panV = 0;
  els.inputPhotoZoom.value = 100;
  els.valPhotoZoom.textContent = "100%";
  els.sourceImg.src = src;
  els.dropzone.classList.add("has-image");
  els.dropzone.querySelector("p").textContent = file.name;
  els.analysisTag.classList.remove("show");
  if (!state.rects.length || !state.locked) generateRects(state.count);
  if (state.ratio === "photo") applyCanvasRatio();
  renderAll();
}

function generateRects(n) {
  const rects = [];
  let attempts = 0;
  while (rects.length < n && attempts < n * 40) {
    attempts++;
    const wPct = 8 + Math.random() * 9; // 8-17%
    const hPct = 8 + Math.random() * 9;
    const xPct = Math.random() * (100 - wPct);
    const yPct = Math.random() * (100 - hPct);
    const candidate = { xPct, yPct, wPct, hPct };
    const overlaps = rects.some((r) => rectOverlap(r, candidate));
    if (!overlaps || attempts > n * 25) rects.push(candidate);
  }
  state.rects = rects;
}

function adjustRectsToCount(n) {
  if (state.rects.length === n) return;
  if (state.rects.length > n) {
    state.rects = state.rects.slice(0, n);
  } else {
    const extra = n - state.rects.length;
    for (let i = 0; i < extra; i++) {
      const wPct = 8 + Math.random() * 9;
      const hPct = 8 + Math.random() * 9;
      state.rects.push({
        xPct: Math.random() * (100 - wPct),
        yPct: Math.random() * (100 - hPct),
        wPct,
        hPct,
      });
    }
  }
}

function rectOverlap(a, b) {
  return !(
    a.xPct + a.wPct < b.xPct ||
    b.xPct + b.wPct < a.xPct ||
    a.yPct + a.hPct < b.yPct ||
    b.yPct + b.hPct < a.yPct
  );
}

function renderAll() {
  applyBackgroundTransform();
  renderMasks();
  renderPoeticText();
  updateRulers();
  renderGuides();
}

function renderMasks() {
  els.maskLayer.innerHTML = "";
  state.rects.forEach((rect, i) => {
    const div = document.createElement("div");
    div.className = "mask-rect";
    div.style.left = rect.xPct + "%";
    div.style.top = rect.yPct + "%";
    div.style.width = rect.wPct + "%";
    div.style.height = rect.hPct + "%";
    div.addEventListener("pointerdown", (e) => startDrag(e, i, div));
    els.maskLayer.appendChild(div);
  });
}

function startDrag(e, index, el) {
  e.preventDefault();
  e.stopPropagation();
  el.setPointerCapture(e.pointerId);
  const containerRect = els.bottomPanel.getBoundingClientRect();
  const rect = state.rects[index];
  const startX = e.clientX;
  const startY = e.clientY;
  const startXPct = rect.xPct;
  const startYPct = rect.yPct;

  function onMove(ev) {
    const dxPct = ((ev.clientX - startX) / containerRect.width) * 100;
    const dyPct = ((ev.clientY - startY) / containerRect.height) * 100;
    rect.xPct = clamp(startXPct + dxPct, 0, 100 - rect.wPct);
    rect.yPct = clamp(startYPct + dyPct, 0, 100 - rect.hPct);
    el.style.left = rect.xPct + "%";
    el.style.top = rect.yPct + "%";
    renderPoeticText();
  }
  function onUp(ev) {
    el.releasePointerCapture(ev.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/* ---------- 尺標與參考線 ---------- */

// 尺標刻度用「匯出後的實際像素」，而不是螢幕像素 ——
// 使用者要對齊的是成品的構圖，螢幕上顯示多大並不重要。
function getExportSize() {
  const [w, h] = getRatioWH();
  return { w: EXPORT_BASE_WIDTH, h: Math.round((EXPORT_BASE_WIDTH * h) / w) };
}

const TICK_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const RULER_THICKNESS = 22;

function pickTickStep(scale) {
  // 相鄰標籤至少隔開 55px，否則數字會擠成一團
  return TICK_STEPS.find((s) => s * scale >= 55) || TICK_STEPS[TICK_STEPS.length - 1];
}

function drawRuler(canvas, exportLen, screenLen, horizontal) {
  if (!screenLen || !exportLen) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round((horizontal ? screenLen : RULER_THICKNESS) * dpr);
  canvas.height = Math.round((horizontal ? RULER_THICKNESS : screenLen) * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--bg-input").trim() || "#21222f";
  const fg = css.getPropertyValue("--text-dim").trim() || "#9092a8";

  const w = horizontal ? screenLen : RULER_THICKNESS;
  const h = horizontal ? RULER_THICKNESS : screenLen;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const scale = screenLen / exportLen;
  const step = pickTickStep(scale);
  const minor = step / 5;

  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.font = "9px Inter, sans-serif";
  ctx.lineWidth = 1;

  for (let v = 0; v <= exportLen + 0.5; v += minor) {
    const p = Math.round(v * scale) + 0.5;
    const isMajor = Math.abs(v % step) < 0.001 || Math.abs((v % step) - step) < 0.001;
    const len = isMajor ? 8 : 4;

    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(p, RULER_THICKNESS);
      ctx.lineTo(p, RULER_THICKNESS - len);
    } else {
      ctx.moveTo(RULER_THICKNESS, p);
      ctx.lineTo(RULER_THICKNESS - len, p);
    }
    ctx.stroke();

    if (isMajor && v > 0 && v < exportLen - step * 0.3) {
      const label = String(Math.round(v));
      if (horizontal) {
        ctx.fillText(label, p + 3, 9);
      } else {
        // 直式尺標的數字轉 90 度，才排得下
        ctx.save();
        ctx.translate(9, p + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }
}

function updateRulers() {
  if (!state.showRulers) return;
  const rect = els.canvasCard.getBoundingClientRect();
  const ex = getExportSize();
  drawRuler(els.rulerTop, ex.w, rect.width, true);
  drawRuler(els.rulerLeft, ex.h, rect.height, false);
}

function guidePosFromEvent(ev, axis) {
  const r = els.canvasCard.getBoundingClientRect();
  return axis === "x" ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
}

function updateGuideEl(el, g) {
  const ex = getExportSize();
  const label = el.querySelector(".guide-label");
  if (g.axis === "x") {
    el.style.left = g.pos * 100 + "%";
    label.textContent = Math.round(g.pos * ex.w) + " px";
  } else {
    el.style.top = g.pos * 100 + "%";
    label.textContent = Math.round(g.pos * ex.h) + " px";
  }
}

function renderGuides() {
  els.guideLayer.innerHTML = "";
  if (!state.showRulers) return;

  state.guides.forEach((g) => {
    const el = document.createElement("div");
    el.className = `guide guide-${g.axis === "x" ? "v" : "h"}`;
    const label = document.createElement("span");
    label.className = "guide-label";
    el.appendChild(label);
    updateGuideEl(el, g);

    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // 別讓底下的照片跟著平移
      beginGuideDrag(ev, g, el);
    });
    el.addEventListener("dblclick", () => {
      state.guides = state.guides.filter((x) => x !== g);
      renderGuides();
    });

    els.guideLayer.appendChild(el);
  });
}

function beginGuideDrag(startEv, guide, el) {
  el.classList.add("dragging");
  let raw = guidePosFromEvent(startEv, guide.axis);
  guide.pos = clamp(raw, 0, 1);
  updateGuideEl(el, guide);

  const onMove = (ev) => {
    raw = guidePosFromEvent(ev, guide.axis);
    guide.pos = clamp(raw, 0, 1);
    updateGuideEl(el, guide);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    el.classList.remove("dragging");
    // 拖出畫布就當作丟棄，跟一般設計工具一致
    if (raw < -0.02 || raw > 1.02) {
      state.guides = state.guides.filter((g) => g !== guide);
    }
    renderGuides();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function startGuideFromRuler(ev, axis) {
  if (!state.showRulers) return;
  ev.preventDefault();
  const guide = { axis, pos: clamp(guidePosFromEvent(ev, axis), 0, 1) };
  state.guides.push(guide);
  renderGuides();
  beginGuideDrag(ev, guide, els.guideLayer.lastElementChild);
}

function setRulersVisible(visible) {
  state.showRulers = visible;
  els.canvasStage.classList.toggle("rulers-off", !visible);
  els.btnToggleRulers.textContent = visible ? "📐 隱藏" : "📐 顯示";
  els.btnToggleRulers.classList.toggle("active", visible);
  // 版面寬度會因為尺標佔位而改變，小圖的取景幾何要重算
  requestAnimationFrame(() => {
    updateRulers();
    renderGuides();
    applyBackgroundTransform();
    renderPoeticText();
  });
}

function addGuides(list) {
  if (!state.showRulers) setRulersVisible(true);
  state.guides.push(...list);
  renderGuides();
}

function getCoverGeometry() {
  const containerRect = els.bottomPanel.getBoundingClientRect();
  const iw = state.imgEl?.naturalWidth;
  const ih = state.imgEl?.naturalHeight;
  if (!iw || !ih || !containerRect.width || !containerRect.height) return null;
  const baseScale = Math.max(containerRect.width / iw, containerRect.height / ih);
  const scale = baseScale * state.photoZoom;
  const dispW = iw * scale;
  const dispH = ih * scale;
  // 用絕對差值：照片比面板大時是「可裁切的餘裕」，比面板小時是「可挪移的空間」。
  // 原本用 Math.max(0, ...)，縮到比面板小就變成 0，整個拖不動。
  const maxOffX = Math.abs(dispW - containerRect.width) / 2;
  const maxOffY = Math.abs(dispH - containerRect.height) / 2;
  const offX = (containerRect.width - dispW) / 2 + state.panU * maxOffX;
  const offY = (containerRect.height - dispH) / 2 + state.panV * maxOffY;
  return { containerW: containerRect.width, containerH: containerRect.height, dispW, dispH, offX, offY, maxOffX, maxOffY };
}

function applyBackgroundTransform() {
  const geom = getCoverGeometry();
  if (!geom) return;
  els.sourceImg.style.width = geom.dispW + "px";
  els.sourceImg.style.height = geom.dispH + "px";
  els.sourceImg.style.left = geom.offX + "px";
  els.sourceImg.style.top = geom.offY + "px";
}

function renderPoeticText() {
  els.poeticText.innerHTML = "";

  if (!state.imgEl) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "先上傳一張照片開始創作";
    els.poeticText.appendChild(p);
    return;
  }

  const geom = getCoverGeometry();
  const words = state.caption.trim().split(/\s+/).filter(Boolean);
  const n = Math.min(state.count, state.rects.length, words.length);
  const [openCh, closeCh] = BRACKETS[state.bracket];

  const insertIndices = [];
  for (let i = 0; i < n; i++) {
    let idx = Math.round(((i + 1) * words.length) / (n + 1)) - 1;
    idx = clamp(idx, 0, words.length - 1);
    if (insertIndices.includes(idx)) idx = Math.min(words.length - 1, idx + 1);
    insertIndices.push(idx);
  }

  words.forEach((word, i) => {
    els.poeticText.appendChild(document.createTextNode(word));
    const chipSlot = insertIndices.indexOf(i);
    if (chipSlot !== -1) {
      els.poeticText.appendChild(document.createTextNode(" "));
      if (openCh) {
        const o = document.createElement("span");
        o.className = "bracket";
        o.textContent = openCh + " ";
        els.poeticText.appendChild(o);
      }
      els.poeticText.appendChild(makeChip(state.rects[chipSlot], geom));
      if (closeCh) {
        const c = document.createElement("span");
        c.className = "bracket";
        c.textContent = " " + closeCh;
        els.poeticText.appendChild(c);
      }
    }
    if (i < words.length - 1) els.poeticText.appendChild(document.createTextNode(" "));
  });
}

function makeChip(rect, geom) {
  const span = document.createElement("span");
  span.className = "chip";

  if (!geom) {
    span.style.width = state.fontSize * state.scale + "px";
    span.style.height = state.fontSize * state.scale + "px";
    return span;
  }

  const rectPx = {
    x: (rect.xPct / 100) * geom.containerW,
    y: (rect.yPct / 100) * geom.containerH,
    w: (rect.wPct / 100) * geom.containerW,
    h: (rect.hPct / 100) * geom.containerH,
  };

  const chipH = state.fontSize * state.scale;
  const zoom = chipH / rectPx.h;
  const chipW = rectPx.w * zoom;

  const bgW = geom.dispW * zoom;
  const bgH = geom.dispH * zoom;
  const bgX = (geom.offX - rectPx.x) * zoom;
  const bgY = (geom.offY - rectPx.y) * zoom;

  span.style.width = chipW + "px";
  span.style.height = chipH + "px";
  span.style.backgroundImage = `url(${state.imgSrc})`;
  span.style.backgroundSize = `${bgW}px ${bgH}px`;
  span.style.backgroundPosition = `${bgX}px ${bgY}px`;
  return span;
}

function analyzeImage(imgEl) {
  const SAMPLE = 24;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  r /= n; g /= n; b /= n;

  const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const saturation = max === 0 ? 0 : (max - min) / max;

  let tone = "neutral";
  if (saturation > 0.12) {
    if (hue < 70 || hue >= 300) tone = "warm";
    else if (hue >= 140 && hue < 260) tone = "cool";
  }

  return { tone, brightness: brightness > 0.5 ? "bright" : "dark", brightnessValue: brightness, hue, saturation };
}

function pickCaptionByAnalysis(analysis) {
  const scores = DEMO_CAPTIONS.map((c) => {
    let score = 0;
    if (c.tone === analysis.tone) score += 2;
    if (c.brightness === analysis.brightness) score += 1;
    return score;
  });
  const bestScore = Math.max(...scores);
  // Include the next tier down too: a single exact match would otherwise
  // return the same caption on every repeat click, which reads as "the
  // button did nothing" even though it analyzed correctly.
  const candidates = scores
    .map((s, i) => (s >= bestScore - 1 ? i : -1))
    .filter((i) => i !== -1);
  const pool = candidates.filter((i) => i !== state.captionIndex);
  const options = pool.length ? pool : candidates;
  return options[Math.floor(Math.random() * options.length)];
}

const TONE_LABEL = { warm: "暖色調", cool: "冷色調", neutral: "中性色調" };

async function generateCaption() {
  const apiKey = els.apiKeyInput.value.trim();
  els.btnAiGen.disabled = true;
  const originalLabel = els.btnAiGen.textContent;
  els.btnAiGen.textContent = "✨ 生成中...";

  try {
    if (apiKey && state.imgSrc) {
      const caption = await callGemini(apiKey, state.imgSrc);
      if (caption) {
        state.caption = caption;
        els.captionInput.value = caption;
        els.analysisTag.innerHTML = `✨ 由 Gemini 生成（模型：<b>${state.geminiModel}</b>）`;
        els.analysisTag.classList.add("show");
        renderPoeticText();
        return;
      }
    }
    applyAnalyzedCaption();
  } catch (err) {
    console.error(err);
    alert("Gemini 生成失敗，已改用「文字分析圖片」。\n" + err.message);
    applyAnalyzedCaption();
  } finally {
    els.btnAiGen.disabled = false;
    els.btnAiGen.textContent = originalLabel;
  }
}

function applyAnalyzedCaption() {
  let idx;
  if (state.imgEl) {
    const analysis = analyzeImage(state.imgEl);
    idx = pickCaptionByAnalysis(analysis);
    els.analysisTag.innerHTML = `🔍 文字分析圖片：偵測到 <b>${TONE_LABEL[analysis.tone]}</b> · <b>${analysis.brightness === "bright" ? "明亮" : "深沉"}</b>，已挑選對應文案`;
    els.analysisTag.classList.add("show");
  } else {
    idx = Math.floor(Math.random() * DEMO_CAPTIONS.length);
    if (idx === state.captionIndex) idx = (idx + 1) % DEMO_CAPTIONS.length;
    els.analysisTag.classList.remove("show");
  }
  state.captionIndex = idx;
  state.caption = DEMO_CAPTIONS[idx].text;
  els.captionInput.value = state.caption;
  renderPoeticText();
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// 快取解析結果，避免每次生成都多打一次 ListModels
let resolvedModel = null;

async function apiError(res, what) {
  // 失敗時帶出 API 自己的錯誤說明，只回報狀態碼查不出原因
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message || "";
  } catch {
    /* 回應不是 JSON 就算了 */
  }
  return new Error(`${what} 失敗（HTTP ${res.status}）${detail ? "：" + detail : ""}`);
}

// 不寫死模型名稱：Gemini 的命名改過幾輪，寫死就會在某天變成 404。
// 直接問這把金鑰能用哪些模型，挑一個支援 generateContent 的。
async function resolveGeminiModel(apiKey) {
  if (resolvedModel) return resolvedModel;

  const res = await fetch(`${GEMINI_BASE}/models?key=${apiKey}`);
  if (!res.ok) throw await apiError(res, "取得模型清單");

  const { models = [] } = await res.json();
  const usable = models.filter((m) =>
    (m.supportedGenerationMethods || []).includes("generateContent")
  );
  if (!usable.length) {
    throw new Error("這把金鑰沒有任何支援 generateContent 的模型可用");
  }

  // 偏好輕量的 flash 系列（快又便宜），其次才是其他可用模型
  const preferred =
    usable.find((m) => /flash/i.test(m.name) && !/vision|embedding/i.test(m.name)) ||
    usable.find((m) => !/embedding/i.test(m.name)) ||
    usable[0];

  resolvedModel = preferred.name.replace(/^models\//, "");
  return resolvedModel;
}

async function callGemini(apiKey, dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mimeType = meta.match(/data:(.*);base64/)?.[1] || "image/png";
  const model = await resolveGeminiModel(apiKey);

  const body = {
    contents: [
      {
        parts: [
          { text: "Write exactly one short poetic English sentence (15-25 words) evocatively describing this image. Return only the sentence, no quotes." },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
  };
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 模型可能中途被下架，清掉快取讓下次重新挑一個
    resolvedModel = null;
    throw await apiError(res, `呼叫模型 ${model}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const blocked = json.promptFeedback?.blockReason;
    throw new Error(blocked ? `內容被擋下（${blocked}）` : `模型 ${model} 沒有回傳文字`);
  }
  state.geminiModel = model;
  return text.trim().replace(/^"|"$/g, "");
}

export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function getDownloadsCapability() {
  // Only present when this page is running as a published Claude Artifact.
  if (typeof window.claude?.use !== "function") return null;
  try {
    return await window.claude.use("downloads");
  } catch {
    return null;
  }
}

export async function saveImage(dataUrl, filename = "poetic-layout.png") {
  const downloads = await getDownloadsCapability();
  if (downloads) {
    await downloads.save({ filename, data: dataUrlToBlob(dataUrl) });
    return;
  }
  // Plain <a download> for the local/self-hosted build.
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function exportImage() {
  if (!state.imgEl) {
    alert("請先上傳一張照片");
    return;
  }
  els.btnExport.disabled = true;
  const originalLabel = els.btnExport.textContent;
  els.btnExport.textContent = "匯出中...";
  try {
    const rect = els.canvasCard.getBoundingClientRect();
    const pixelRatio = EXPORT_BASE_WIDTH / rect.width;
    const dataUrl = await toPng(els.canvasCard, { pixelRatio, cacheBust: true, skipFonts: true });
    await saveImage(dataUrl);
  } catch (err) {
    if (err?.code === "declined") return;
    console.error(err);
    alert("匯出失敗：" + (err?.message || err?.code || err));
  } finally {
    els.btnExport.disabled = false;
    els.btnExport.textContent = originalLabel;
  }
}
