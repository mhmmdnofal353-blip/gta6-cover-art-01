// Cover Vice — hand-in program for the gta6-cover-art-01 make.fun entry.
//
// The deliverable is the static web app in app/ (open app/index.html in a
// desktop browser; it runs fully offline with no build step). This program
// copies app/ and screenshots/ into the output directory and writes the
// dossier.json summary the judge reads, using the vendored dossier library.
//
//   node serve.ts                                  try the app locally
//   MAKEFUN_OUTPUT_DIR=out node main.ts            hand-in dry run

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'app'), join(outputDir, 'app'), { recursive: true });

const shotsDir = join(entryDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the competition gate: the dossier text budget, at most four
// screenshots of 256 KiB each, and the app tree limits.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Cover Vice handed in to ${outputDir}`);
