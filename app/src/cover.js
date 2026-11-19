// Cover Vice — cover composition engine.
//
// One draw function (drawCover) paints a complete GTA-style multi-panel
// cover onto any 2D canvas context at any pixel size. The editor preview,
// the ?shot=cover screenshot mode and the PNG export all call it, so what
// you see is exactly what you download.
//
// The look, built from original code only: a collage of photo panels split
// by diagonal dividers with white frames, one larger hero panel, every
// photo pushed through a saturated comic grade (contrast/saturate filter,
// a two-colour gradient wash in soft-light + overlay, a vignette), a big
// condensed uppercase title with a hard offset shadow, and a caption bar
// along the bottom edge.
'use strict';

const FONT_FAMILY = 'Anton, "Arial Narrow", sans-serif';

// The three export sizes, in exact pixels.
const SIZES = {
  square: { id: 'square', label: 'Square · 1080×1080', w: 1080, h: 1080 },
  portrait: { id: 'portrait', label: 'Portrait · 1080×1350', w: 1080, h: 1350 },
  wide: { id: 'wide', label: 'Wide · 1920×1080', w: 1920, h: 1080 },
};

// Colour presets. gradeTop/gradeBottom tint every photo; frame is the
// backdrop behind the panels; border is the panel frame colour; accent is
// used for the title shadow, the caption-bar rule and UI highlights.
const PRESETS = [
  {
    id: 'sunset', name: 'Sunset Vice',
    gradeTop: '#ff9a3c', gradeBottom: '#ff2e88',
    frame: '#160512', border: '#ffffff',
    titleFill: '#ffffff', titleStroke: '#20082e', accent: '#ffd23c',
    barBg: 'rgba(14,3,18,0.88)', barText: '#ffeef7',
    emptyA: '#3a1030', emptyB: '#12040f',
  },
  {
    id: 'neon', name: 'Neon Nights',
    gradeTop: '#00e5ff', gradeBottom: '#ff00c8',
    frame: '#04060f', border: '#eaf6ff',
    titleFill: '#ffffff', titleStroke: '#0b0033', accent: '#00e5ff',
    barBg: 'rgba(2,6,20,0.88)', barText: '#e8fbff',
    emptyA: '#0a1440', emptyB: '#05030f',
  },
  {
    id: 'gold', name: 'Gold Hour',
    gradeTop: '#ffc93c', gradeBottom: '#0fb5a8',
    frame: '#0d1206', border: '#fffbe8',
    titleFill: '#fffbe8', titleStroke: '#26160a', accent: '#ffb703',
    barBg: 'rgba(16,12,2,0.88)', barText: '#fff6da',
    emptyA: '#2e2410', emptyB: '#0f0c04',
  },
];

function presetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

// --- Layout ---------------------------------------------------------------
// Panel rectangles in normalised cover coordinates, before the diagonal
// shear. Wide covers get a tall central hero; square/portrait covers get a
// big top-left hero over a three-up bottom row.
const LAYOUT_TALL = [
  { x: 0.00, y: 0.00, w: 0.62, h: 0.52, hero: true },
  { x: 0.62, y: 0.00, w: 0.38, h: 0.30 },
  { x: 0.62, y: 0.30, w: 0.38, h: 0.22 },
  { x: 0.00, y: 0.52, w: 0.38, h: 0.48 },
  { x: 0.38, y: 0.52, w: 0.32, h: 0.48 },
  { x: 0.70, y: 0.52, w: 0.30, h: 0.48 },
];
const LAYOUT_WIDE = [
  { x: 0.00, y: 0.00, w: 0.30, h: 0.55 },
  { x: 0.00, y: 0.55, w: 0.30, h: 0.45 },
  { x: 0.30, y: 0.00, w: 0.40, h: 1.00, hero: true },
  { x: 0.70, y: 0.00, w: 0.30, h: 0.50 },
  { x: 0.70, y: 0.50, w: 0.30, h: 0.50 },
];

// Shear factor: vertical dividers lean by this fraction of the cover width
// across the full height — the angled cuts that make it read as cover art.
const SHEAR = 0.055;

// Returns the panel polygons for a cover of w×h pixels: arrays of [x, y]
// points, sheared so shared edges still meet exactly (the shear depends
// only on y, so neighbouring panels stay watertight).
function panelPolygons(w, h) {
  const cells = w / h > 1.2 ? LAYOUT_WIDE : LAYOUT_TALL;
  return cells.map((c) => {
    const corners = [
      [c.x, c.y], [c.x + c.w, c.y],
      [c.x + c.w, c.y + c.h], [c.x, c.y + c.h],
    ];
    return corners.map(([nx, ny]) => [
      (nx + SHEAR * (0.5 - ny)) * w,
      ny * h,
    ]);
  });
}

function polygonPath(ctx, poly) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function polygonBounds(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// --- Photo painting -------------------------------------------------------
// Draws img cover-fitted into box (a pixel rect), honouring a crop:
// zoom multiplies the cover-fit scale, ox/oy shift the centre by a
// fraction of the box size. The comic grade starts here via ctx.filter.
function drawPhotoIntoBox(ctx, img, box, crop) {
  const s0 = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const s = s0 * crop.zoom;
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  const cx = box.x + box.w / 2 + crop.ox * box.w * 0.6;
  const cy = box.y + box.h / 2 + crop.oy * box.h * 0.6;
  ctx.save();
  ctx.filter = 'saturate(1.5) contrast(1.14) brightness(1.04)';
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
}

// The colour wash + vignette that sells the grade, clipped to one panel.
function gradePanel(ctx, box, preset) {
  const wash = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  wash.addColorStop(0, preset.gradeTop);
  wash.addColorStop(1, preset.gradeBottom);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = wash;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.32;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();

  const r = Math.max(box.w, box.h) * 0.78;
  const vig = ctx.createRadialGradient(
    box.x + box.w / 2, box.y + box.h / 2, r * 0.45,
    box.x + box.w / 2, box.y + box.h / 2, r,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = vig;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

// Placeholder for a panel with no photo yet: preset-tinted diagonals and
// the panel number, so the editor layout is always readable.
function drawEmptyPanel(ctx, box, preset, index) {
  const fill = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  fill.addColorStop(0, preset.emptyA);
  fill.addColorStop(1, preset.emptyB);
  ctx.fillStyle = fill;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = `${Math.round(Math.min(box.w, box.h) * 0.5)}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), box.x + box.w / 2, box.y + box.h / 2);
  ctx.restore();
}

// --- Title & caption ------------------------------------------------------
// Largest Anton size (starting from startPx) whose rendered width fits.
function fitFontPx(ctx, text, maxWidth, startPx) {
  let px = startPx;
  ctx.font = `${px}px ${FONT_FAMILY}`;
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px *= 0.94;
    ctx.font = `${px}px ${FONT_FAMILY}`;
  }
  return px;
}

function drawTitle(ctx, w, h, state, preset) {
  const title = (state.title || '').trim().toUpperCase();
  if (!title) return;
  const px = fitFontPx(ctx, title, w * 0.92, w * 0.17);
  ctx.save();
  ctx.translate(w / 2, h * (w / h > 1.2 ? 0.19 : 0.145));
  ctx.rotate(-0.028);
  ctx.font = `${px}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = preset.accent;
  ctx.shadowOffsetX = px * 0.055;
  ctx.shadowOffsetY = px * 0.075;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = preset.titleStroke;
  ctx.lineWidth = px * 0.16;
  ctx.strokeText(title, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = preset.titleFill;
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

function drawCaptionBar(ctx, w, h, state, preset) {
  const caption = (state.caption || '').trim().toUpperCase();
  if (!caption) return;
  const barH = Math.round(h * 0.078);
  const y = h - barH;
  ctx.save();
  ctx.fillStyle = preset.barBg;
  ctx.fillRect(0, y, w, barH);
  ctx.fillStyle = preset.accent;
  ctx.fillRect(0, y, w, Math.max(3, h * 0.004));
  const px = fitFontPx(ctx, caption, w * 0.9, barH * 0.52);
  try { ctx.letterSpacing = `${Math.round(px * 0.06)}px`; } catch { /* older canvas */ }
  ctx.font = `${px}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = preset.barText;
  ctx.fillText(caption, w / 2, y + barH / 2 + px * 0.04);
  ctx.restore();
}

// --- The one draw function ------------------------------------------------
// state: { sizeId, presetId, title, caption, mode: 'panels'|'sliced',
//          panels: [{photoId, ox, oy, zoom}], sliced: {photoId, ox, oy, zoom},
//          selected }
// images: Map of photoId -> HTMLImageElement (already loaded).
// opts.forExport skips editor-only overlays (the selection outline).
function drawCover(ctx, w, h, state, images, opts = {}) {
  const preset = presetById(state.presetId);
  const polys = panelPolygons(w, h);

  ctx.save();
  ctx.fillStyle = preset.frame;
  ctx.fillRect(0, 0, w, h);

  polys.forEach((poly, i) => {
    const box = polygonBounds(poly);
    ctx.save();
    polygonPath(ctx, poly);
    ctx.clip();
    if (state.mode === 'sliced') {
      const img = images.get(state.sliced.photoId);
      if (img) {
        // One photo drawn against the whole cover, clipped per panel, so
        // the image runs continuously across the diagonal cuts.
        drawPhotoIntoBox(ctx, img, { x: 0, y: 0, w, h }, state.sliced);
        gradePanel(ctx, box, preset);
      } else {
        drawEmptyPanel(ctx, box, preset, i);
      }
    } else {
      const panel = state.panels[i];
      const img = panel && images.get(panel.photoId);
      if (img) {
        drawPhotoIntoBox(ctx, img, box, panel);
        gradePanel(ctx, box, preset);
      } else {
        drawEmptyPanel(ctx, box, preset, i);
      }
    }
    ctx.restore();
  });

  // White panel frames: stroke every polygon, then the outer edge.
  const borderPx = Math.max(5, w * 0.0055);
  ctx.strokeStyle = preset.border;
  ctx.lineWidth = borderPx;
  ctx.lineJoin = 'round';
  polys.forEach((poly) => { polygonPath(ctx, poly); ctx.stroke(); });
  ctx.strokeRect(borderPx / 2, borderPx / 2, w - borderPx, h - borderPx);

  drawTitle(ctx, w, h, state, preset);
  drawCaptionBar(ctx, w, h, state, preset);

  // Editor-only: outline the selected panel so it can be found at a glance.
  if (!opts.forExport && state.mode === 'panels' && polys[state.selected]) {
    ctx.save();
    ctx.strokeStyle = preset.accent;
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.setLineDash([w * 0.02, w * 0.012]);
    polygonPath(ctx, polys[state.selected]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Renders the cover at the exact export pixel size onto a fresh canvas —
// the PNG export and the ?shot=cover mode both go through here.
function renderExportCanvas(state, images) {
  const size = SIZES[state.sizeId] || SIZES.square;
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  drawCover(canvas.getContext('2d'), size.w, size.h, state, images, { forExport: true });
  return canvas;
}

window.CoverEngine = {
  FONT_FAMILY, SIZES, PRESETS, presetById,
  panelPolygons, polygonBounds, pointInPolygon,
  drawCover, renderExportCanvas,
};
