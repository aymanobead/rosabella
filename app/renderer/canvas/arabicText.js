'use strict';

/**
 * arabicText.js
 * Renders text (especially Arabic) using SVG/HTML shaping via Chromium,
 * then returns a data URL for placing on Fabric canvas.
 * This guarantees correct Arabic letter shaping and RTL direction.
 */

/**
 * Detect if text is primarily Arabic/RTL
 */
function isRtlText(text) {
  if (!text) return false;
  const rtlChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const totalLetters = (text.match(/\p{L}/gu) || []).length;
  return totalLetters > 0 && rtlChars / totalLetters > 0.3;
}

/**
 * Wrap text into lines that fit within the given pixel width.
 * Uses a temporary canvas for measurement.
 */
function wrapText(text, maxWidth, fontSize, fontFamily) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px "${fontFamily}", "Cairo", "Arial", sans-serif`;

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Measure text width in pixels for a given font.
 */
function measureText(text, fontSize, fontFamily) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px "${fontFamily}", "Cairo", "Arial", sans-serif`;
  return ctx.measureText(text).width;
}

/**
 * Calculate optimal font size to fit text within area.
 */
function calcFontSize(text, areaW, areaH, maxSize, minSize, lineHeight, fontFamily) {
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lines = wrapText(text, areaW, size, fontFamily);
    const totalH = lines.length * size * lineHeight;
    if (totalH <= areaH) return { size, lines };
  }
  // Fallback: use minSize and allow overflow
  const lines = wrapText(text, areaW, minSize, fontFamily);
  return { size: minSize, lines };
}

/**
 * Render text to a canvas ImageData using SVG/Chromium shaping.
 * Returns a data URL (PNG) of the rendered text area.
 *
 * @param {object} opts
 * @param {string}  opts.text         - Message text
 * @param {number}  opts.width        - Area width in px
 * @param {number}  opts.height       - Area height in px
 * @param {string}  opts.fontFamily   - Font family name
 * @param {string}  opts.color        - Text color (CSS)
 * @param {number}  opts.maxFontSize
 * @param {number}  opts.minFontSize
 * @param {number}  opts.lineHeight
 * @param {string}  opts.align        - 'center'|'left'|'right'
 * @returns {Promise<string>}         - PNG data URL
 */
async function renderTextToImage(opts) {
  const {
    text, width, height, fontFamily, color,
    maxFontSize, minFontSize, lineHeight, align
  } = opts;

  if (!text || !text.trim()) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas.toDataURL('image/png');
  }

  const isRtl = isRtlText(text);
  const direction = isRtl ? 'rtl' : 'ltr';
  const textAlign = align === 'center' ? 'center' : (isRtl ? 'right' : 'left');

  const { size: fontSize, lines } = calcFontSize(
    text, width, height, maxFontSize, minFontSize, lineHeight, fontFamily
  );

  const totalTextH = lines.length * fontSize * lineHeight;
  const startY = (height - totalTextH) / 2 + fontSize * 0.8;

  // Build SVG with proper text elements
  const svgLines = lines.map((line, i) => {
    const y = startY + i * fontSize * lineHeight;
    let x, anchor;
    if (align === 'center') {
      x = width / 2;
      anchor = 'middle';
    } else if (isRtl) {
      x = width - 10;
      anchor = 'end';
    } else {
      x = 10;
      anchor = 'start';
    }
    // Escape XML special chars
    const escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<text x="${x}" y="${y}"
      font-family="${fontFamily}, Cairo, Arial, sans-serif"
      font-size="${fontSize}"
      fill="${color}"
      text-anchor="${anchor}"
      direction="${direction}"
      unicode-bidi="plaintext">${escaped}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${svgLines}
  </svg>`;

  // Use Blob URL to load SVG as image (preserves Chromium shaping)
  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: render directly on canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.font = `${fontSize}px "${fontFamily}", Cairo, Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = textAlign;
      ctx.direction = direction;
      lines.forEach((line, i) => {
        const y = startY + i * fontSize * lineHeight;
        const x = align === 'center' ? width / 2 : (isRtl ? width - 10 : 10);
        ctx.fillText(line, x, y);
      });
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}

module.exports = { renderTextToImage, isRtlText, calcFontSize, wrapText };
