// Cover Vice — editor wiring.
// Loads photos (user files stay on this machine; the two bundled samples
// ship with the app), keeps the cover state, and repaints the preview
// through the same paintCover the export uses.

import {
  COVER_PRESETS, COVER_SIZES, paintCover, panelsForSize,
  pointInPolygon, renderCoverCanvas,
} from './cover.js';

const SAMPLES = [
  { id: 'pier', label: 'Pier at dusk', src: 'samples/pier.jpg' },
  { id: 'boulevard', label: 'Boulevard', src: 'samples/boulevard.jpg' },
];

const state = {
  title: 'VICE CITY HEAT',
  caption: 'One last score',
  presetId: 'sunset',
  sizeId: 'square',
  mode: 'sliced',
  photos: [],
  photoNames: [],
  panels: [],
  sliced: { photo: 0, offX: 0, offY: 0, zoom: 1 },
  selected: 0,
};

const $ = (id) => document.getElementById(id);
const preview = $('preview');
const pctx = preview.getContext('2d');

function freshPanel(photo) {
  return { photo, offX: 0, offY: 0, zoom: 1 };
}

function ensurePanels() {
  const count = panelsForSize(state.sizeId, 100, 100).length;
  while (state.panels.length < count) {
    state.panels.push(freshPanel(state.panels.length % Math.max(1, state.photos.length)));
  }
}

function activePlacement() {
  return state.mode === 'sliced' ? state.sliced : state.panels[state.selected];
}

function drawPreview() {
  const size = COVER_SIZES[state.sizeId];
  preview.width = size.width;
  preview.height = size.height;
  paintCover(pctx, size.width, size.height, state);
  if (state.mode === 'panels') {
    // Outline the selected panel so it is clear which one edits apply to.
    const poly = panelsForSize(state.sizeId, size.width, size.height)[state.selected];
    if (poly) {
      pctx.save();
      pctx.beginPath();
      poly.forEach(([x, y], i) => (i === 0 ? pctx.moveTo(x, y) : pctx.lineTo(x, y)));
      pctx.closePath();
      pctx.strokeStyle = '#ffe14d';
      pctx.lineWidth = Math.max(5, size.width * 0.007);
      pctx.setLineDash([size.width * 0.02, size.width * 0.012]);
      pctx.stroke();
      pctx.restore();
    }
  }
}

function syncControls() {
  const place = activePlacement();
  if (!place) return;
  $('offX').value = place.offX;
  $('offY').value = place.offY;
  $('zoom').value = place.zoom;
  $('photoPick').value = String(place.photo);
  $('panelLabel').textContent = state.mode === 'sliced'
    ? 'Sliced photo (all panels)'
    : `Panel ${state.selected + 1} of ${state.panels.length}`;
}

function refreshPhotoPick() {
  const pick = $('photoPick');
  pick.innerHTML = '';
  state.photoNames.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = name;
    pick.appendChild(opt);
  });
  const thumbs = $('thumbs');
  thumbs.innerHTML = '';
  state.photos.forEach((img, i) => {
    const t = document.createElement('img');
    t.src = img.src;
    t.alt = state.photoNames[i];
    t.title = state.photoNames[i];
    t.addEventListener('click', () => {
      activePlacement().photo = i;
      syncControls();
      drawPreview();
    });
    thumbs.appendChild(t);
  });
}

function addPhoto(image, name) {
  state.photos.push(image);
  state.photoNames.push(name);
  ensurePanels();
  refreshPhotoPick();
  syncControls();
  drawPreview();
}

function loadSample(id) {
  const sample = SAMPLES.find((s) => s.id === id) || SAMPLES[0];
  const existing = state.photoNames.indexOf(sample.label);
  if (existing >= 0) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { addPhoto(img, sample.label); resolve(state.photos.length - 1); };
    img.src = sample.src;
  });
}

function loadUserFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => addPhoto(img, file.name);
    img.src = url;
  }
}

// Editor events -------------------------------------------------------------

function bindEditor() {
  $('titleInput').addEventListener('input', (e) => { state.title = e.target.value; drawPreview(); });
  $('captionInput').addEventListener('input', (e) => { state.caption = e.target.value; drawPreview(); });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.presetId = btn.dataset.preset;
      document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b === btn));
      drawPreview();
    });
  });

  $('sizePick').addEventListener('change', (e) => {
    state.sizeId = e.target.value;
    state.selected = 0;
    ensurePanels();
    syncControls();
    drawPreview();
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b === btn));
      syncControls();
      drawPreview();
    });
  });

  $('photoPick').addEventListener('change', (e) => {
    activePlacement().photo = Number(e.target.value);
    drawPreview();
  });
  $('offX').addEventListener('input', (e) => { activePlacement().offX = Number(e.target.value); drawPreview(); });
  $('offY').addEventListener('input', (e) => { activePlacement().offY = Number(e.target.value); drawPreview(); });
  $('zoom').addEventListener('input', (e) => { activePlacement().zoom = Number(e.target.value); drawPreview(); });

  $('fileInput').addEventListener('change', (e) => loadUserFiles(e.target.files));
  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = await loadSample(btn.dataset.sample);
      activePlacement().photo = idx;
      syncControls();
      drawPreview();
    });
  });

  const stage = $('stage');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('drop');
    loadUserFiles(e.dataTransfer.files);
  });

  // Click a panel to select it; drag on the preview to reposition its photo.
  let drag = null;
  preview.addEventListener('pointerdown', (e) => {
    const rect = preview.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * preview.width;
    const y = (e.clientY - rect.top) / rect.height * preview.height;
    if (state.mode === 'panels') {
      const polys = panelsForSize(state.sizeId, preview.width, preview.height);
      const hit = polys.findIndex((poly) => pointInPolygon(x, y, poly));
      if (hit >= 0) { state.selected = hit; syncControls(); }
    }
    drag = { x: e.clientX, y: e.clientY };
    preview.setPointerCapture(e.pointerId);
    drawPreview();
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = preview.getBoundingClientRect();
    const place = activePlacement();
    place.offX += (e.clientX - drag.x) / rect.width * 0.9;
    place.offY += (e.clientY - drag.y) / rect.height * 0.9;
    place.offX = Math.max(-0.6, Math.min(0.6, place.offX));
    place.offY = Math.max(-0.6, Math.min(0.6, place.offY));
    drag = { x: e.clientX, y: e.clientY };
    syncControls();
    drawPreview();
  });
  preview.addEventListener('pointerup', () => { drag = null; });

  $('exportBtn').addEventListener('click', () => {
    const canvas = renderCoverCanvas(state);
    const a = document.createElement('a');
    a.download = `cover-vice-${state.sizeId}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
}

// Shot mode -----------------------------------------------------------------
// ?shot=cover renders only the finished cover, full viewport, through the
// export path. ?shot=editor opens the editor with a sample pre-loaded.

async function runShotMode(params) {
  document.body.classList.add('shot');
  if (params.get('title')) state.title = params.get('title');
  if (params.get('caption')) state.caption = params.get('caption');
  if (params.get('preset') && COVER_PRESETS[params.get('preset')]) state.presetId = params.get('preset');
  if (params.get('size') && COVER_SIZES[params.get('size')]) state.sizeId = params.get('size');
  await loadSample(params.get('photo') || 'pier');
  state.sliced.photo = state.photos.length - 1;
  state.panels.forEach((p) => { p.photo = state.sliced.photo; });

  if (params.get('shot') === 'editor') {
    document.body.classList.remove('shot');
    state.caption = params.get('caption') || 'Boulevard queen';
    $('titleInput').value = state.title;
    $('captionInput').value = state.caption;
    bindEditor();
    syncControls();
    drawPreview();
    return;
  }
  $('app').style.display = 'none';
  const canvas = renderCoverCanvas(state);
  canvas.id = 'shotCanvas';
  document.body.appendChild(canvas);
}

async function boot() {
  try {
    await document.fonts.load('80px "Anton"');
    await document.fonts.ready;
  } catch { /* fallback fonts still draw */ }
  const params = new URLSearchParams(location.search);
  ensurePanels();
  if (params.get('shot')) {
    await runShotMode(params);
    return;
  }
  bindEditor();
  await loadSample('pier');
  await loadSample('boulevard');
  state.sliced.photo = 0;
  syncControls();
  drawPreview();
}

boot();
