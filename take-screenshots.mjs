// Cover Vice — screenshot capture.
// Serves app/ locally, renders each entry of shots.json with the headless
// Chrome shell Puppeteer installed on this machine, then converts the PNGs
// to JPEGs that respect the competition caps (<= 256 KiB, long side
// <= 1280 px, short side >= 480 px) using python3 + PIL.
//
//   node take-screenshots.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const appRoot = join(root, 'app');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

function findHeadlessShell() {
  // Prefer the known install on this machine; fall back to scanning the
  // Puppeteer cache so the script still works after a browser update.
  const known = join(process.env.HOME, '.cache', 'puppeteer', 'chrome-headless-shell',
    'linux-157.0.8103.78', 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  if (existsSync(known)) return known;
  const base = join(process.env.HOME, '.cache', 'puppeteer', 'chrome-headless-shell');
  for (const ver of readdirSync(base)) {
    const bin = join(base, ver, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(bin)) return bin;
  }
  throw new Error('chrome-headless-shell not found under ~/.cache/puppeteer');
}

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(appRoot, normalize(path)));
  if (file !== appRoot && !file.startsWith(appRoot + sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = findHeadlessShell();
const scratch = mkdtempSync(join(tmpdir(), 'cover-vice-shots-'));

const convert = `
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
w, h = im.size
scale = min(1.0, 1280 / max(w, h))
if scale < 1.0:
    im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
assert min(im.size) >= 480, f'short side too small: {im.size}'
for q in (88, 82, 76, 70, 62, 54):
    im.save(dst, 'JPEG', quality=q)
    import os
    if os.path.getsize(dst) <= 262144:
        break
import os
assert os.path.getsize(dst) <= 262144, 'still over byte cap'
print(dst, im.size, os.path.getsize(dst))
`;

for (const shot of shots) {
  const png = join(scratch, shot.name.replace(/\.jpg$/, '.png'));
  const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
  // A hard timeout per shot: a wedged renderer must fail one screenshot,
  // never stall the whole capture run.
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--virtual-time-budget=15000',
    `--window-size=${shot.w},${shot.h}`, `--screenshot=${png}`, url,
  ], { stdio: 'inherit', timeout: 60000 });
  execFileSync('python3', ['-c', convert, png, join(root, 'screenshots', shot.name)], { stdio: 'inherit' });
}

server.close();
console.log('screenshots done');
