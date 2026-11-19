// take-screenshots.mjs — regenerate the four screenshots in screenshots/.
//
// For each entry in shots.json this:
//   1. serves app/ with serve.ts on a scratch port,
//   2. opens the page in headless Chromium at the entry's window size and
//      saves a PNG once the app has painted (the ?shot= modes set
//      window.__shotReady; --virtual-time-budget lets that run),
//   3. converts the PNG to a quality-85 JPEG with python3 + PIL, scaling
//      down if needed so the long side is at most 1280 px,
//   4. asserts the gate's caps: file <= 262144 bytes, long side <= 1280,
//      short side >= 480.
//
// Run: node take-screenshots.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// The browser binary: CHROME_PATH wins. The default is the Puppeteer
// chrome-headless-shell installed on this machine — the full Chromium at
// /opt/meta-chromium/chrome refuses to start outside the browser service
// (it demands a Hatch WebGL domain-policy file), so it cannot be driven
// from a script like this one.
const CHROME = process.env.CHROME_PATH
  || `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = 8137;
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

const server = spawn('node', [join(here, 'serve.ts'), '--port', String(PORT)], {
  stdio: 'ignore',
});
const scratch = mkdtempSync(join(tmpdir(), 'cover-vice-shots-'));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('serve.ts did not come up');
}

try {
  await waitForServer();
  for (const shot of shots) {
    const png = join(scratch, shot.name.replace(/\.jpg$/, '.png'));
    const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
    execFileSync(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--virtual-time-budget=15000',
      `--window-size=${shot.w},${shot.h}`,
      `--screenshot=${png}`, url,
    ], { stdio: 'pipe' });

    const out = join(here, 'screenshots', shot.name);
    const report = execFileSync('python3', ['-c', `
from PIL import Image
import json, sys
img = Image.open(${JSON.stringify(png)}).convert('RGB')
if max(img.size) > 1280:
    img.thumbnail((1280, 1280), Image.LANCZOS)
img.save(${JSON.stringify(out)}, 'JPEG', quality=85)
print(json.dumps({'size': img.size}))
`], { encoding: 'utf8' });
    const { size } = JSON.parse(report.trim());
    const bytes = readFileSync(out).length;
    const longSide = Math.max(...size);
    const shortSide = Math.min(...size);
    if (bytes > 262144) throw new Error(`${shot.name}: ${bytes} bytes > 262144`);
    if (longSide > 1280) throw new Error(`${shot.name}: long side ${longSide} > 1280`);
    if (shortSide < 480) throw new Error(`${shot.name}: short side ${shortSide} < 480`);
    console.log(`${shot.name}: ${size[0]}x${size[1]}, ${bytes} bytes — OK`);
  }
} finally {
  server.kill();
  rmSync(scratch, { recursive: true, force: true });
}
