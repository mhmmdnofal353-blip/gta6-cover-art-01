// Cover Vice — editor wiring.
//
// Owns the document state (photos, panel assignments, crops, preset, size,
// words), binds every control in index.html to it, and repaints the preview
// through CoverEngine.drawCover — the same function the PNG export uses.
// Photos are read from the user's machine into memory only; nothing is
// uploaded anywhere (the app makes no network requests at all).
//
// URL-param screenshot mode (used by take-screenshots.mjs):
//   ?shot=cover&size=square|portrait|wide&photo=pier|boulevard
//     &preset=sunset|neon|gold&title=...&caption=...
//       shows only the finished cover, drawn by the export code path.
//   ?shot=editor&photo=boulevard&caption=...
//       opens the editor with that sample spread across the panels.
'use strict';

const E = window.CoverEngine;
const $ = (id) => document.getElementById(id);

const SAMPLES = [
  { id: 'sample-pier', name: 'Pier at dusk', url: 'samples/pier.jpg' },
  { id: 'sample-boulevard', name: 'Boulevard', url: 'samples/boulevard.jpg' },
];

// Deterministic per-panel crops used when one photo fills every panel, so
// a single picture still reads as a collage of different moments.
const SPREAD_CROPS = [
  { ox: 0.0, oy: 0.0, zoom: 1.0 },
  { ox: 0.35, oy: 0.1, zoom: 1.35 },
  { ox: -0.3, oy: -0.05, zoom: 1.25 },
  { ox: 0.15, oy: -0.25, zoom: 1.45 },
  { ox: -0.2, oy: 0.2, zoom: 1.3 },
  { ox: 0.25, oy: 0.25, zoom: 1.4 },
];

const state = {
  sizeId: 'square',
  presetId: 'sunset',
  title: 'Cover Vice',
  caption: 'One city. No brakes.',
  mode: 'panels',
  panels: [],
  sliced: { photoId: null, ox: 0, oy: 0, zoom: 1 },
  selected: 0,
};

const images = new Map(); // photoId -> HTMLImageElement
const photoList = [];     // [{id, name}] in load order
let photoSeq = 0;

function sizeDims() { return E.SIZES[state.sizeId]; }

function blankPanel() { return { photoId: null, ox: 0, oy: 0, zoom: 1 }; }

// Keeps state.panels the same length as the current layout's panel count.
function syncPanelCount() {
  const n = E.panelPolygons(sizeDims().w, sizeDims().h).length;
  while (state.panels.length < n) state.panels.push(blankPanel());
  state.panels.length = n;
  if (state.selected >= n) state.selected = 0;
}

function activeCrop() {
  return state.mode === 'sliced' ? state.sliced : state.panels[state.selected];
}

// --- Photo loading --------------------------------------------------------
function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPhoto(id, name, url) {
  if (!images.has(id)) {
    images.set(id, await loadImageFromUrl(url));
    photoList.push({ id, name });
  }
  renderTray();
  return id;
}

async function addPhotoFile(file) {
  const id = `file-${++photoSeq}`;
  const url = URL.createObjectURL(file);
  await addPhoto(id, file.name.replace(/\.[^.]+$/, ''), url);
  return id;
}

// Spreads one photo across every panel with the deterministic crops.
function spreadPhoto(photoId) {
  state.panels = state.panels.map((_, i) => ({
    photoId, ...(SPREAD_CROPS[i % SPREAD_CROPS.length]),
  }));
  state.sliced.photoId = photoId;
}

function assignToSelected(photoId) {
  if (state.mode === 'sliced') {
    state.sliced.photoId = photoId;
  } else {
    state.panels[state.selected].photoId = photoId;
  }
  redraw();
}

// --- Preview --------------------------------------------------------------
const preview = $('preview');
const pctx = preview.getContext('2d');

function redraw() {
  syncPanelCount();
  const { w, h } = sizeDims();
  if (preview.width !== w || preview.height !== h) {
    preview.width = w;
    preview.height = h;
  }
  E.drawCover(pctx, w, h, state, images, {});
  syncCropControls();
  $('panelLabel').textContent = state.mode === 'sliced'
    ? 'Sliced photo — one image across all panels'
    : `Panel ${state.selected + 1} of ${state.panels.length}`;
}

// Maps a pointer event to cover-design coordinates.
function eventToDesign(ev) {
  const r = preview.getBoundingClientRect();
  const { w, h } = sizeDims();
  return {
    x: (ev.clientX - r.left) * (w / r.width),
    y: (ev.clientY - r.top) * (h / r.height),
    dx: ev.movementX * (w / r.width),
    dy: ev.movementY * (h / r.height),
  };
}

let dragging = false;
preview.addEventListener('pointerdown', (ev) => {
  const p = eventToDesign(ev);
  if (state.mode === 'panels') {
    const polys = E.panelPolygons(sizeDims().w, sizeDims().h);
    const hit = polys.findIndex((poly) => E.pointInPolygon(p.x, p.y, poly));
    if (hit >= 0) state.selected = hit;
  }
  dragging = true;
  preview.setPointerCapture(ev.pointerId);
  redraw();
});
preview.addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  const p = eventToDesign(ev);
  const crop = activeCrop();
  const { w, h } = sizeDims();
  const box = state.mode === 'sliced'
    ? { w, h }
    : E.polygonBounds(E.panelPolygons(w, h)[state.selected]);
  crop.ox = clamp(crop.ox + p.dx / (box.w * 0.6), -1, 1);
  crop.oy = clamp(crop.oy + p.dy / (box.h * 0.6), -1, 1);
  redraw();
});
preview.addEventListener('pointerup', () => { dragging = false; });

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Keyboard fine-tuning: arrow keys nudge the active crop by a small step
// (Shift = bigger step), Delete clears the selected panel's photo.
document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input, textarea')) return;
  const step = ev.shiftKey ? 0.08 : 0.02;
  const crop = activeCrop();
  if (ev.key === 'ArrowLeft') crop.ox = clamp(crop.ox - step, -1, 1);
  else if (ev.key === 'ArrowRight') crop.ox = clamp(crop.ox + step, -1, 1);
  else if (ev.key === 'ArrowUp') crop.oy = clamp(crop.oy - step, -1, 1);
  else if (ev.key === 'ArrowDown') crop.oy = clamp(crop.oy + step, -1, 1);
  else if (ev.key === 'Delete' && state.mode === 'panels') {
    state.panels[state.selected].photoId = null;
  } else return;
  ev.preventDefault();
  redraw();
});

// --- Controls -------------------------------------------------------------
function syncCropControls() {
  const crop = activeCrop();
  if (!crop) return;
  $('zoom').value = crop.zoom;
  $('offX').value = crop.ox;
  $('offY').value = crop.oy;
}

function bindCropSlider(id, key) {
  $(id).addEventListener('input', () => {
    activeCrop()[key] = Number($(id).value);
    redraw();
  });
}
bindCropSlider('zoom', 'zoom');
bindCropSlider('offX', 'ox');
bindCropSlider('offY', 'oy');

$('resetCrop').addEventListener('click', () => {
  Object.assign(activeCrop(), { ox: 0, oy: 0, zoom: 1 });
  redraw();
});

$('title').addEventListener('input', () => { state.title = $('title').value; redraw(); });
$('caption').addEventListener('input', () => { state.caption = $('caption').value; redraw(); });

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => { state.mode = radio.value; redraw(); });
});

document.querySelectorAll('[data-size]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.sizeId = btn.dataset.size;
    document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b === btn));
    redraw();
  });
});

const presetRow = $('presets');
E.PRESETS.forEach((preset) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'preset' + (preset.id === state.presetId ? ' on' : '');
  btn.innerHTML = `<span class="chip" style="background:linear-gradient(135deg,${preset.gradeTop},${preset.gradeBottom})"></span>${preset.name}`;
  btn.addEventListener('click', () => {
    state.presetId = preset.id;
    presetRow.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', b === btn));
    redraw();
  });
  presetRow.appendChild(btn);
});

// Photo tray: thumbnails of everything loaded; click assigns to the
// selected panel (or the sliced photo).
function renderTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  photoList.forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    const img = document.createElement('img');
    img.src = images.get(id).src;
    img.alt = name;
    const label = document.createElement('span');
    label.textContent = name;
    btn.append(img, label);
    btn.addEventListener('click', () => assignToSelected(id));
    tray.appendChild(btn);
  });
}

$('fileInput').addEventListener('change', async (ev) => {
  const files = [...ev.target.files];
  for (const file of files) {
    const id = await addPhotoFile(file);
    assignToSelected(id);
  }
  ev.target.value = '';
});

SAMPLES.forEach((sample) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sampleBtn';
  btn.textContent = `Load sample: ${sample.name}`;
  btn.addEventListener('click', async () => {
    const id = await addPhoto(sample.id, sample.name, sample.url);
    assignToSelected(id);
  });
  $('samples').appendChild(btn);
});

$('spread').addEventListener('click', () => {
  const current = state.mode === 'sliced' ? state.sliced.photoId
    : state.panels[state.selected].photoId;
  if (current) { spreadPhoto(current); redraw(); }
});

// Drag & drop photos anywhere onto the stage.
const stage = $('stage');
['dragenter', 'dragover'].forEach((t) => stage.addEventListener(t, (ev) => {
  ev.preventDefault();
  stage.classList.add('drop');
}));
['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, (ev) => {
  ev.preventDefault();
  stage.classList.remove('drop');
}));
stage.addEventListener('drop', async (ev) => {
  const files = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  for (const file of files) {
    const id = await addPhotoFile(file);
    assignToSelected(id);
  }
});

// Export: render at the exact pixel size through the same draw function.
$('exportBtn').addEventListener('click', async () => {
  await document.fonts.ready;
  const canvas = E.renderExportCanvas(state, images);
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cover-vice-${canvas.width}x${canvas.height}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('status').textContent = `Saved cover-vice-${canvas.width}x${canvas.height}.png`;
  }, 'image/png');
});

// --- Screenshot mode ------------------------------------------------------
async function runShotMode(params) {
  const shot = params.get('shot');
  const photoName = params.get('photo') || 'pier';
  const sample = SAMPLES.find((s) => s.url.endsWith(`${photoName}.jpg`)) || SAMPLES[0];
  const photoId = await addPhoto(sample.id, sample.name, sample.url);

  if (params.get('size')) state.sizeId = params.get('size');
  if (params.get('preset')) state.presetId = params.get('preset');
  if (params.get('title')) state.title = params.get('title');
  if (params.get('caption')) state.caption = params.get('caption');
  $('title').value = state.title;
  $('caption').value = state.caption;
  syncPanelCount();
  spreadPhoto(photoId);

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const full = E.renderExportCanvas(state, images);
    full.id = 'shotCanvas';
    document.body.appendChild(full);
  } else {
    document.body.classList.add('shot-editor');
    redraw();
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}

// --- Boot -----------------------------------------------------------------
(async function boot() {
  syncPanelCount();
  await document.fonts.load('100px Anton');
  await document.fonts.ready;
  const params = new URLSearchParams(location.search);
  if (params.get('shot')) {
    await runShotMode(params);
  } else {
    // Friendly first paint: the pier sample spread across the panels.
    const id = await addPhoto(SAMPLES[0].id, SAMPLES[0].name, SAMPLES[0].url);
    spreadPhoto(id);
    redraw();
  }
})();
