'use strict';

/**
 * cardEngine.js
 * Core card rendering engine using Fabric.js (v7+, Promise-based API).
 * Handles template loading, text rendering, and export.
 */

const { renderTextToImage, isRtlText } = require('./arabicText.js');
const { ipcRenderer } = require('electron');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

let fabricCanvas = null;
let currentTemplate = null;
let templatesBasePath = '';
let templateCache = {}; // cached toObject data keyed by bgPath

/**
 * Initialize the Fabric canvas on a given HTML canvas element id.
 */
function initCanvas(canvasId, displayWidth, displayHeight) {
  if (fabricCanvas) {
    fabricCanvas.dispose();
  }
  fabricCanvas = new fabric.Canvas(canvasId, {
    width: displayWidth,
    height: displayHeight,
    selection: false,
    renderOnAddRemove: false,
    backgroundColor: '#ffffff'
  });
  return fabricCanvas;
}

/**
 * Convert mm to pixels at given DPI.
 */
function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * Get the templates base path from main process.
 */
async function getTemplatesPath() {
  if (templatesBasePath) return templatesBasePath;
  templatesBasePath = await ipcRenderer.invoke('get-templates-path');
  return templatesBasePath;
}

/**
 * Load template background image using fabric 7 Promise-based API.
 * Reads the local SVG file via fs and converts to a base64 data URL
 * to avoid requiring webSecurity: false.
 * Returns a fabric.Image object set to fill the target dimensions.
 */
async function loadBgImage(bgAbsPath, scaledW, scaledH) {
  // Read file via Node.js fs and convert to data URL (no file:// needed)
  const fileBuffer = fs.readFileSync(bgAbsPath);
  const b64 = fileBuffer.toString('base64');
  const mime = bgAbsPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  const dataUrl = `data:${mime};base64,${b64}`;

  const img = await fabric.Image.fromURL(dataUrl);
  if (!img || !img.width) {
    throw new Error(`Failed to load background: ${bgAbsPath}`);
  }
  img.set({
    left: 0,
    top: 0,
    scaleX: scaledW / img.width,
    scaleY: scaledH / img.height,
    selectable: false,
    evented: false
  });
  return img;
}

/**
 * Scale a template coordinate from the template's native 1000x800 to target canvas size.
 */
function scaleCoord(value, nativeSize, targetSize) {
  return (value / nativeSize) * targetSize;
}

/**
 * Main render function. Generates card on the Fabric canvas.
 *
 * @param {object} opts
 * @param {object} opts.template    - Template definition from templates.json
 * @param {string} opts.message     - Message text
 * @param {string} opts.sender      - Sender name (optional)
 * @param {string} opts.receiver    - Receiver name (optional)
 * @param {number} opts.widthMm     - Card width in mm
 * @param {number} opts.heightMm    - Card height in mm
 * @param {number} opts.dpi         - Export DPI
 * @param {boolean} opts.isPreview  - If true, scale to preview canvas; if false, use full DPI
 * @param {number} opts.previewW    - Preview canvas display width
 * @param {number} opts.previewH    - Preview canvas display height
 */
async function renderCard(opts) {
  const {
    template, message, sender, receiver,
    widthMm, heightMm, dpi,
    isPreview, previewW, previewH
  } = opts;

  currentTemplate = template;

  // Compute export dimensions
  const exportW = mmToPx(widthMm, dpi);
  const exportH = mmToPx(heightMm, dpi);

  // Determine canvas dimensions
  let canvasW, canvasH, scaleFactor;
  if (isPreview) {
    const scaleX = previewW / exportW;
    const scaleY = previewH / exportH;
    scaleFactor = Math.min(scaleX, scaleY, 1);
    canvasW = Math.round(exportW * scaleFactor);
    canvasH = Math.round(exportH * scaleFactor);
  } else {
    canvasW = exportW;
    canvasH = exportH;
    scaleFactor = 1;
  }

  // (Re)init canvas
  initCanvas('card-canvas', canvasW, canvasH);
  fabricCanvas.clear();
  fabricCanvas.backgroundColor = '#ffffff';

  // Template native dims
  const nativeW = 1000;
  const nativeH = 800;

  // ── Background ──────────────────────────────────────────────────────────
  const basePath = await getTemplatesPath();
  const path = require('path');
  const bgAbsPath = path.join(basePath, template.background);

  try {
    const bgImg = await loadBgImage(bgAbsPath, canvasW, canvasH);
    fabricCanvas.add(bgImg);
  } catch (e) {
    console.warn('BG load failed, using solid color:', e.message);
    fabricCanvas.backgroundColor = '#fdf8f0';
  }

  const styles = template.styles;
  const fontFamily = styles.messageFont || 'Cairo';

  // ── Receiver name ────────────────────────────────────────────────────────
  if (receiver && template.nameAreas && template.nameAreas.receiver) {
    const na = template.nameAreas.receiver;
    const rx = scaleCoord(na.x, nativeW, canvasW);
    const ry = scaleCoord(na.y, nativeH, canvasH);
    const rw = scaleCoord(na.w, nativeW, canvasW);
    const rh = scaleCoord(na.h, nativeH, canvasH);
    const nameFontSize = Math.max(
      Math.round(scaleCoord(styles.maxFontSize * 0.55, nativeH, canvasH)),
      12
    );
    const receiverImgUrl = await renderTextToImage({
      text: receiver,
      width: Math.round(rw),
      height: Math.round(rh),
      fontFamily,
      color: styles.messageColor,
      maxFontSize: nameFontSize,
      minFontSize: Math.max(nameFontSize - 8, 10),
      lineHeight: 1.2,
      align: styles.align
    });
    await addImageToCanvas(receiverImgUrl, rx, ry, rw, rh);
  }

  // ── Message text ─────────────────────────────────────────────────────────
  if (message && message.trim()) {
    const ta = template.textArea;
    const tx = scaleCoord(ta.x, nativeW, canvasW);
    const ty = scaleCoord(ta.y, nativeH, canvasH);
    const tw = scaleCoord(ta.w, nativeW, canvasW);
    const th = scaleCoord(ta.h, nativeH, canvasH);

    const scaledMaxFont = Math.max(Math.round(scaleCoord(styles.maxFontSize, nativeH, canvasH)), styles.minFontSize);
    const scaledMinFont = Math.max(Math.round(scaleCoord(styles.minFontSize, nativeH, canvasH)), 8);

    const msgImgUrl = await renderTextToImage({
      text: message,
      width: Math.round(tw),
      height: Math.round(th),
      fontFamily,
      color: styles.messageColor,
      maxFontSize: scaledMaxFont,
      minFontSize: scaledMinFont,
      lineHeight: styles.lineHeight || 1.35,
      align: styles.align || 'center'
    });
    await addImageToCanvas(msgImgUrl, tx, ty, tw, th);
  }

  // ── Sender name ──────────────────────────────────────────────────────────
  if (sender && template.nameAreas && template.nameAreas.sender) {
    const na = template.nameAreas.sender;
    const sx = scaleCoord(na.x, nativeW, canvasW);
    const sy = scaleCoord(na.y, nativeH, canvasH);
    const sw = scaleCoord(na.w, nativeW, canvasW);
    const sh = scaleCoord(na.h, nativeH, canvasH);
    const nameFontSize = Math.max(
      Math.round(scaleCoord(styles.maxFontSize * 0.45, nativeH, canvasH)),
      10
    );
    const senderImgUrl = await renderTextToImage({
      text: sender,
      width: Math.round(sw),
      height: Math.round(sh),
      fontFamily,
      color: styles.messageColor,
      maxFontSize: nameFontSize,
      minFontSize: Math.max(nameFontSize - 6, 8),
      lineHeight: 1.2,
      align: styles.align
    });
    await addImageToCanvas(senderImgUrl, sx, sy, sw, sh);
  }

  fabricCanvas.renderAll();
  return fabricCanvas;
}

/**
 * Add a data URL image to canvas at given position using fabric 7 Promise API.
 */
async function addImageToCanvas(dataUrl, x, y, w, h) {
  try {
    const img = await fabric.Image.fromURL(dataUrl);
    if (!img) return;
    img.set({
      left: x,
      top: y,
      scaleX: w / (img.width || w),
      scaleY: h / (img.height || h),
      selectable: false,
      evented: false
    });
    fabricCanvas.add(img);
  } catch (e) {
    console.warn('addImageToCanvas failed:', e.message);
  }
}

/**
 * Render card at full export resolution on a temporary canvas, return data URL.
 */
async function renderFullResCard(opts) {
  const { widthMm, heightMm, dpi, template, message, sender, receiver } = opts;

  const exportW = mmToPx(widthMm, dpi);
  const exportH = mmToPx(heightMm, dpi);

  const tmpId = '__export_canvas__';
  let tmpEl = document.getElementById(tmpId);
  if (!tmpEl) {
    tmpEl = document.createElement('canvas');
    tmpEl.id = tmpId;
    tmpEl.style.display = 'none';
    document.body.appendChild(tmpEl);
  }

  const origCanvas = fabricCanvas;

  const fullCanvas = new fabric.Canvas(tmpId, {
    width: exportW,
    height: exportH,
    selection: false,
    renderOnAddRemove: false
  });
  fabricCanvas = fullCanvas;

  await renderCard({
    template, message, sender, receiver,
    widthMm, heightMm, dpi,
    isPreview: false,
    previewW: exportW,
    previewH: exportH
  });

  const dataUrl = fullCanvas.toDataURL({ format: 'png', multiplier: 1 });
  fullCanvas.dispose();
  fabricCanvas = origCanvas;

  return dataUrl;
}

/**
 * Export the current card as PNG.
 */
async function exportPng(opts) {
  const dataUrl = await renderFullResCard(opts);
  return ipcRenderer.invoke('save-png', dataUrl);
}

/**
 * Export the current card as PDF.
 */
async function exportPdf(opts) {
  const { widthMm, heightMm } = opts;
  const dataUrl = await renderFullResCard(opts);

  // Build PDF with pdf-lib
  const pdfDoc = await PDFDocument.create();
  const pageW = mmToPx(widthMm, 72);  // PDF points (72 dpi)
  const pageH = mmToPx(heightMm, 72);
  const page = pdfDoc.addPage([pageW, pageH]);

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const pngImage = await pdfDoc.embedPng(pngBytes);

  page.drawImage(pngImage, { x: 0, y: 0, width: pageW, height: pageH });

  const pdfBytes = await pdfDoc.save();
  return ipcRenderer.invoke('save-pdf', Array.from(pdfBytes));
}

module.exports = { initCanvas, renderCard, exportPng, exportPdf, mmToPx };
