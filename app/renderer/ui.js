'use strict';

const path = require('path');
const fs = require('fs');
const { ipcRenderer } = require('electron');
const { renderCard, exportPng, exportPdf, renderFullResCard } = require('./canvas/cardEngine.js');

// ─── State ──────────────────────────────────────────────────────────────────
let currentLang = 'en';
let i18n = {};
let templates = [];
let currentTemplate = null;
let previewDebounceTimer = null;
const DEBOUNCE_MS = 300;

// Card size presets (in mm)
const SIZE_PRESETS = {
  a6:    { w: 105, h: 148 },
  a5:    { w: 148, h: 210 },
  '10x15': { w: 100, h: 150 },
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadI18n('en');
  await loadTemplates();
  setupEventListeners();
  updateOccasionOptions();
  applyLanguage();
  schedulePreview();
});

// ─── i18n ────────────────────────────────────────────────────────────────────
async function loadI18n(lang) {
  currentLang = lang;
  const filePath = path.join(__dirname, `i18n/${lang}.json`);
  i18n = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function t(key) {
  const parts = key.split('.');
  let val = i18n;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) return key;
  }
  return val || key;
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  document.getElementById('app-title').textContent = t('appName');

  // Update lang toggle label to show the *other* language
  document.getElementById('lang-toggle').textContent = currentLang === 'en' ? 'العربية' : 'English';

  updateOccasionOptions();
}

// ─── Templates ───────────────────────────────────────────────────────────────
async function loadTemplates() {
  const basePath = await ipcRenderer.invoke('get-templates-path');
  const manifestPath = path.join(basePath, 'templates.json');
  templates = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function getTemplatesForOccasion(occasion) {
  return templates.filter(tmpl => tmpl.occasion === occasion);
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
function setupEventListeners() {
  // Language toggle
  document.getElementById('lang-toggle').addEventListener('click', async () => {
    const newLang = currentLang === 'en' ? 'ar' : 'en';
    await loadI18n(newLang);
    applyLanguage();
  });

  // Occasion change
  document.getElementById('occasion-select').addEventListener('change', () => {
    updateTemplateOptions();
    schedulePreview();
  });

  // Template change
  document.getElementById('template-select').addEventListener('change', () => {
    const templateId = document.getElementById('template-select').value;
    currentTemplate = templates.find(tmpl => tmpl.id === templateId) || null;
    schedulePreview();
  });

  // Message/name inputs
  ['message-input', 'sender-input', 'receiver-input'].forEach(id => {
    document.getElementById(id).addEventListener('input', schedulePreview);
  });

  // Size preset
  document.getElementById('size-preset').addEventListener('change', () => {
    const preset = document.getElementById('size-preset').value;
    const customFields = document.getElementById('custom-size-fields');
    if (preset === 'custom') {
      customFields.style.display = 'flex';
    } else {
      customFields.style.display = 'none';
      if (SIZE_PRESETS[preset]) {
        document.getElementById('width-input').value = SIZE_PRESETS[preset].w;
        document.getElementById('height-input').value = SIZE_PRESETS[preset].h;
      }
    }
    schedulePreview();
  });

  // Width/height/dpi changes
  ['width-input', 'height-input', 'dpi-input'].forEach(id => {
    document.getElementById(id).addEventListener('change', schedulePreview);
  });

  // Regenerate
  document.getElementById('btn-regenerate').addEventListener('click', renderPreview);

  // Print mode toggle
  document.getElementById('print-mode').addEventListener('change', () => {
    const mode = document.getElementById('print-mode').value;
    document.getElementById('print-a4-options').style.display =
      mode === 'a4' ? 'flex' : 'none';
  });
  // Initialise visibility
  document.getElementById('print-a4-options').style.display = 'none';

  // Export buttons
  document.getElementById('btn-export-png').addEventListener('click', handleExportPng);
  document.getElementById('btn-export-pdf').addEventListener('click', handleExportPdf);
  document.getElementById('btn-print').addEventListener('click', handlePrint);
}

// ─── UI State Helpers ─────────────────────────────────────────────────────────
function updateOccasionOptions() {
  const select = document.getElementById('occasion-select');
  const occasions = ['birthday', 'wedding', 'graduation', 'thankyou', 'love'];
  select.innerHTML = occasions.map(occ =>
    `<option value="${occ}">${t('occasions.' + occ)}</option>`
  ).join('');
  updateTemplateOptions();
}

function updateTemplateOptions() {
  const occasion = document.getElementById('occasion-select').value;
  const select = document.getElementById('template-select');
  const filtered = getTemplatesForOccasion(occasion);
  select.innerHTML = filtered.map(tmpl =>
    `<option value="${tmpl.id}">${tmpl.name}</option>`
  ).join('');
  currentTemplate = filtered[0] || null;
}

function getCardDimensions() {
  const preset = document.getElementById('size-preset').value;
  let w, h;
  if (preset === 'custom') {
    w = parseFloat(document.getElementById('width-input').value) || 100;
    h = parseFloat(document.getElementById('height-input').value) || 150;
  } else if (SIZE_PRESETS[preset]) {
    w = SIZE_PRESETS[preset].w;
    h = SIZE_PRESETS[preset].h;
  } else {
    w = 100; h = 150;
  }
  const dpi = parseInt(document.getElementById('dpi-input').value, 10) || 150;
  return { w, h, dpi };
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function schedulePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(renderPreview, DEBOUNCE_MS);
}

async function renderPreview() {
  if (!currentTemplate) return;

  const message  = document.getElementById('message-input').value;
  const sender   = document.getElementById('sender-input').value;
  const receiver = document.getElementById('receiver-input').value;
  const { w, h, dpi } = getCardDimensions();

  const previewPanel = document.getElementById('preview-panel');
  const previewW = previewPanel.clientWidth  - 40;
  const previewH = previewPanel.clientHeight - 40;

  try {
    await renderCard({
      template: currentTemplate,
      message, sender, receiver,
      widthMm: w, heightMm: h, dpi,
      isPreview: true,
      previewW, previewH
    });
  } catch (err) {
    console.error('Preview render error:', err);
  }
}

// ─── Export & Print ───────────────────────────────────────────────────────────
async function handleExportPng() {
  if (!currentTemplate) return;
  const message  = document.getElementById('message-input').value;
  const sender   = document.getElementById('sender-input').value;
  const receiver = document.getElementById('receiver-input').value;
  const { w, h, dpi } = getCardDimensions();
  setButtonLoading('btn-export-png', true);
  try {
    await exportPng({ template: currentTemplate, message, sender, receiver, widthMm: w, heightMm: h, dpi });
  } finally {
    setButtonLoading('btn-export-png', false);
  }
}

async function handleExportPdf() {
  if (!currentTemplate) return;
  const message  = document.getElementById('message-input').value;
  const sender   = document.getElementById('sender-input').value;
  const receiver = document.getElementById('receiver-input').value;
  const { w, h, dpi } = getCardDimensions();
  setButtonLoading('btn-export-pdf', true);
  try {
    await exportPdf({ template: currentTemplate, message, sender, receiver, widthMm: w, heightMm: h, dpi });
  } finally {
    setButtonLoading('btn-export-pdf', false);
  }
}

async function handlePrint() {
  if (!currentTemplate) return;
  const message  = document.getElementById('message-input').value;
  const sender   = document.getElementById('sender-input').value;
  const receiver = document.getElementById('receiver-input').value;
  const { w, h, dpi } = getCardDimensions();

  const mode        = document.getElementById('print-mode').value;
  const orientation = document.getElementById('print-orientation').value;
  const layoutCount = parseInt(document.getElementById('print-layout').value, 10) || 1;
  const marginMm    = parseFloat(document.getElementById('print-margin').value) || 0;

  setButtonLoading('btn-print', true);
  try {
    const imageDataUrl = await renderFullResCard({
      template: currentTemplate,
      message, sender, receiver,
      widthMm: w, heightMm: h, dpi
    });

    await ipcRenderer.invoke('print-card', {
      mode,
      cardWmm: w,
      cardHmm: h,
      orientation,
      layoutCount,
      marginMm,
      imageDataUrl
    });
  } catch (err) {
    console.error('Print error:', err);
  } finally {
    setButtonLoading('btn-print', false);
  }
}

function setButtonLoading(id, loading) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = loading;
}
