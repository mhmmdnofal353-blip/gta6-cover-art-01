// Cover Vice — make.fun entry point (Node 22, standard library only).
//
// The entry is a fully offline static web app in app/ (plain HTML/CSS/JS,
// no build step, no network requests) plus four JPEG screenshots in
// screenshots/. Running this file hands the entry in: it mirrors app/ and
// screenshots/ into the output directory and writes dossier.json there,
// using the vendored make.fun dossier library in vendor/makefun-app.ts.
//
// Output directory: process.env.MAKEFUN_OUTPUT_DIR, defaulting to /output.
// Try it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Mirror the app first, then the screenshots, so the output tree is the
// entry exactly as it sits beside this file.
mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(entryDir, 'screenshots'))) {
  cpSync(join(entryDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier caps are the competition gate's own limits, passed verbatim:
// at most 160 KiB of text in the summary, at most 4 screenshots of at most
// 256 KiB each, and app/ capped at 993 files / 48 MiB with no single path
// over 1000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
