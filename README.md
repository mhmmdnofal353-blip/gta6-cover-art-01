# gta6-cover-art-01

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/mhmmdnofal353-blip/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/mhmmdnofal353-blip/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

**Cover Vice** is an offline web app that turns your photos into bold,
GTA-style multi-panel cover art — an original fan-art tool with no game
logos, artwork, characters or fonts.

Drop in a photo (or use the two bundled samples), and Cover Vice slices it
across a collage grid with angled dividers and white panel borders, one
larger hero panel, a saturated comic grade with a sunset/neon wash and
vignette, a big tilted condensed title that auto-fits the canvas, and a
caption bar along the bottom. Three looks are built in — **Sunset Vice**
(orange/pink), **Neon Nights** (magenta/cyan) and **Gold Hour**
(amber/teal) — each re-grading the panels and re-colouring the frame,
title and caption bar.

You can run one photo continuously across every panel ("one photo,
sliced") or give each panel its own photo: click a panel to select it,
assign any loaded photo, drag on the preview or use the sliders to
reposition, and zoom per panel. Covers export at exactly 1080×1080,
1080×1350 or 1920×1080 — the layout adapts to each aspect — rendered by
the same draw routine that drives the live preview, and downloaded as a
PNG. Photos never leave your machine: the app is plain static files with
zero network requests.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. (Or just open
`app/index.html` — there is no build step.)

`node main.ts` is the hand-in program: it copies `app/` and
`screenshots/` to the output directory (`MAKEFUN_OUTPUT_DIR` outside the
grader) and writes `dossier.json`. Screenshots are staged scenes listed
in `shots.json`, captured with `node take-screenshots.mjs`. The Anton
typeface is bundled under the SIL Open Font License (see
`app/fonts/OFL.txt`).
