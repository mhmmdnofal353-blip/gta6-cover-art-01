// Cover Vice — composition engine.
// One draw routine (paintCover) drives the live preview, the screenshot
// mode and the PNG export, so what you see is exactly what you download.

export const COVER_SIZES = {
  square: { id: 'square', label: 'Square 1080 × 1080', width: 1080, height: 1080 },
  portrait: { id: 'portrait', label: 'Portrait 1080 × 1350', width: 1080, height: 1350 },
  wide: { id: 'wide', label: 'Wide 1920 × 1080', width: 1920, height: 1080 },
};

export const COVER_PRESETS = {
  sunset: {
    id: 'sunset', label: 'Sunset Vice',
    sky: '#ff9a3c', glow: '#ff4d8d', deep: '#3b1054',
    frame: '#fff7ea', title: '#ffffff', titleEdge: '#2a0a2e',
    bar: '#1c0b26', caption: '#ffd9a0',
  },
  neon: {
    id: 'neon', label: 'Neon Nights',
    sky: '#ff2ea6', glow: '#22d3ee', deep: '#0b1035',
    frame: '#eafcff', title: '#fdfdff', titleEdge: '#12002e',
    bar: '#070a24', caption: '#8ef4ff',
  },
  gold: {
    id: 'gold', label: 'Gold Hour',
    sky: '#ffc233', glow: '#ff7847', deep: '#0f3d3e',
    frame: '#fffbe8', title: '#fffdf4', titleEdge: '#231303',
    bar: '#122b26', caption: '#ffe9a8',
  },
};

// Panel layouts -------------------------------------------------------------
// Each panel is a polygon in unit space (0..1). Neighbouring panels share
// edges, so the collage tiles the canvas with no gaps; the shared edges are
// slanted, which gives the classic diagonal-divider cover look. Panel 0 is
// always the hero — the largest cell of the grid.

function layoutSquare() {
  return [
    [[0, 0], [0.60, 0], [0.54, 0.52], [0, 0.56]],
    [[0.60, 0], [1, 0], [1, 0.40], [0.54, 0.52]],
    [[0, 0.56], [0.54, 0.52], [0.50, 1], [0, 1]],
    [[0.54, 0.52], [1, 0.40], [1, 1], [0.50, 1]],
  ];
}

function layoutPortrait() {
  return [
    [[0, 0], [1, 0], [1, 0.40], [0, 0.46]],
    [[0, 0.46], [0.52, 0.42], [0.50, 0.72], [0, 0.74]],
    [[0.52, 0.42], [1, 0.40], [1, 0.70], [0.50, 0.72]],
    [[0, 0.74], [0.50, 0.72], [1, 0.70], [1, 1], [0, 1]],
  ];
}

function layoutWide() {
  return [
    [[0, 0], [0.44, 0], [0.40, 1], [0, 1]],
    [[0.44, 0], [0.71, 0], [0.75, 1], [0.40, 1]],
    [[0.71, 0], [1, 0], [1, 0.52], [0.73, 0.55]],
    [[0.75, 1], [0.73, 0.55], [1, 0.52], [1, 1]],
  ];
}

export function panelsForSize(sizeId, width, height) {
  const unit = sizeId === 'wide' ? layoutWide()
    : sizeId === 'portrait' ? layoutPortrait() : layoutSquare();
  return unit.map((poly) => poly.map(([ux, uy]) => [ux * width, uy * height]));
}

export function panelBounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Photo placement -----------------------------------------------------------
// A placement is { photo, offX, offY, zoom }: offX/offY say how far the
// photo may drift, as a fraction of the box it covers.

function drawPhotoCover(ctx, image, cx, cy, boxW, boxH, placement) {
  const scale = Math.max(boxW / image.naturalWidth, boxH / image.naturalHeight) * placement.zoom;
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const x = cx - w / 2 + placement.offX * boxW;
  const y = cy - h / 2 + placement.offY * boxH;
  ctx.drawImage(image, x, y, w, h);
}

function tracePath(ctx, poly) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

// Grading -------------------------------------------------------------------
// A sunset/neon wash laid over the photo in soft-light, a hot spot in
// overlay, then a gentle vignette so the frame edges feel printed.

function gradePanel(ctx, preset, bounds, width, height) {
  const wash = ctx.createLinearGradient(0, bounds.y, 0, bounds.y + bounds.h);
  wash.addColorStop(0, preset.sky);
  wash.addColorStop(0.55, preset.glow);
  wash.addColorStop(1, preset.deep);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = wash;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();

  const hot = ctx.createRadialGradient(
    width * 0.5, height * 0.28, 10, width * 0.5, height * 0.28, width * 0.75);
  hot.addColorStop(0, preset.glow);
  hot.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = hot;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

function vignette(ctx, width, height) {
  const g = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// Lettering -----------------------------------------------------------------

function fitFontSize(ctx, text, maxWidth, startPx, family) {
  let px = startPx;
  while (px > 24) {
    ctx.font = `${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 4;
  }
  return px;
}

function paintTitle(ctx, state, preset, width, height) {
  const title = (state.title || '').trim().toUpperCase();
  if (!title) return;
  const family = '"Anton", "Arial Narrow", sans-serif';
  ctx.save();
  ctx.translate(width / 2, height * 0.135);
  ctx.rotate(-0.028);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = fitFontSize(ctx, title, width * 0.92, height * 0.155, family);
  ctx.font = `${px}px ${family}`;
  try { ctx.letterSpacing = `${Math.round(px * 0.02)}px`; } catch { /* older engines */ }
  ctx.lineJoin = 'round';
  ctx.shadowColor = preset.titleEdge;
  ctx.shadowOffsetX = px * 0.055;
  ctx.shadowOffsetY = px * 0.075;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = preset.titleEdge;
  ctx.lineWidth = px * 0.16;
  ctx.strokeText(title, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = preset.title;
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

function paintCaptionBar(ctx, state, preset, width, height) {
  const caption = (state.caption || '').trim().toUpperCase();
  const barH = Math.max(44, height * 0.085);
  ctx.save();
  ctx.fillStyle = preset.bar;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, height - barH, width, barH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = preset.glow;
  ctx.fillRect(0, height - barH, width, Math.max(3, height * 0.006));
  if (caption) {
    const family = '"Anton", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = fitFontSize(ctx, caption, width * 0.9, barH * 0.52, family);
    ctx.font = `${px}px ${family}`;
    try { ctx.letterSpacing = `${Math.round(px * 0.14)}px`; } catch { /* older engines */ }
    ctx.fillStyle = preset.caption;
    ctx.fillText(caption, width / 2, height - barH / 2 + 2);
  }
  ctx.restore();
}

// The one draw routine ------------------------------------------------------
// state = {
//   title, caption, presetId, sizeId, mode: 'sliced' | 'panels',
//   photos: [HTMLImageElement...],
//   panels: [{ photo: index, offX, offY, zoom }...],
//   sliced: { photo: index, offX, offY, zoom },
// }

export function paintCover(ctx, width, height, state) {
  const preset = COVER_PRESETS[state.presetId] || COVER_PRESETS.sunset;
  const polys = panelsForSize(state.sizeId, width, height);

  ctx.save();
  ctx.fillStyle = preset.deep;
  ctx.fillRect(0, 0, width, height);

  polys.forEach((poly, index) => {
    const bounds = panelBounds(poly);
    ctx.save();
    tracePath(ctx, poly);
    ctx.clip();
    ctx.filter = 'contrast(1.16) saturate(1.55) brightness(1.03)';
    if (state.mode === 'sliced') {
      const image = state.photos[state.sliced.photo];
      if (image) {
        // One photograph flows under the whole collage: every panel shows
        // the slice of the full-canvas picture that lies beneath it.
        drawPhotoCover(ctx, image, width / 2, height / 2, width, height, state.sliced);
      }
    } else {
      const slot = state.panels[index] || state.panels[0];
      const image = slot && state.photos[slot.photo];
      if (image) {
        drawPhotoCover(ctx, image,
          bounds.x + bounds.w / 2, bounds.y + bounds.h / 2,
          bounds.w, bounds.h, slot);
      }
    }
    ctx.filter = 'none';
    gradePanel(ctx, preset, bounds, width, height);
    ctx.restore();
  });

  vignette(ctx, width, height);

  // White frame lines over the shared slanted edges.
  ctx.save();
  ctx.strokeStyle = preset.frame;
  ctx.lineWidth = Math.max(4, width * 0.009);
  ctx.lineJoin = 'round';
  for (const poly of polys) { tracePath(ctx, poly); ctx.stroke(); }
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
  ctx.restore();

  paintTitle(ctx, state, preset, width, height);
  paintCaptionBar(ctx, state, preset, width, height);
  ctx.restore();
}

// Render a finished cover at its exact export size on a fresh canvas.
export function renderCoverCanvas(state) {
  const size = COVER_SIZES[state.sizeId] || COVER_SIZES.square;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  paintCover(canvas.getContext('2d'), size.width, size.height, state);
  return canvas;
}
