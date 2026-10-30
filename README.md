# bento-slide skill

Turn a product brief into **one 16:9 bento-grid summary slide** — a single self-contained HTML file that works offline.

Three styles in one file: **Light**, **Dark**, and **Keynote**. Light/Dark fill missing art with dense, precise Canvas2D data viz (dot-matrix / hairline language, one accent). Keynote is for when you already have product art. Switch themes in the browser; charts repaint from tokens.

Built for launch recaps, “what’s new” slides, capability overviews, and one-screen heroes — not live dashboards or multi-slide decks (run once per slide).

## What you get

- **9 layout presets** (L4 / L5 / L6 / C5 / M5 / T5 / S4 / L9 / K12) plus room to invent partitions — every slide should differ in grid and chart set from the last
- **Chart recipe library** — radial clocks, histograms, gauges, calendars, die-maps, film-strips, drift bars, and more — cast from real numbers in the brief
- **Offline export built in** — 2× PNG, all-theme PNG zip, 16:9 PDF, Keynote/PowerPoint-ready `.pptx`, and print-to-vector-PDF (press **E** or use the Export menu)
- **Zero dependencies in the delivered file** — fonts + viz + export inlined (~145 KB); opens anywhere offline

## Examples

Demo of the skill in action (~24 s):

<video src="https://github.com/haodonghuii1-cmd/bento-slide-skill/raw/main/examples/example-demo.mp4" controls muted playsinline width="100%"></video>

If the player doesn't load, open [`examples/example-demo.mp4`](examples/example-demo.mp4) — GitHub plays it in the browser.

Source: [@Yur1freedom on X](https://x.com/Yur1freedom/status/2115995906197823999)

## What's in here

| Path | Role |
|---|---|
| `SKILL.md` | Full playbook (layouts, recipes, export, variation rules) |
| `SLIDES.md` | Slide registry — read before picking layout/charts |
| `TECH-NOTES.md` | Implementation notes |
| `SUMMARY.md` | Short overview |
| `bento-shell.html` + `viz/` + `fonts/` + `export/` | Dev shell + modules |
| `build/build.mjs` | Inline → one offline HTML (`node build/build.mjs`) |
| `build/export.mjs` | Headless batch export / QA screenshots |
| `dist/bento-slide.html` | Built offline proof |
| `bento-proof.html` | Reference slide |
| `qa/*.png` | Quality-floor captures (study `*-zoom-*.png`) |
| `examples/` | Demo video shown above |

## Quick start

1. Read `SKILL.md` §1–§5 and `SLIDES.md`.
2. Edit shell or copy modules into a new slide folder.
3. `node build/build.mjs` → offline HTML in `dist/`.
4. In the browser: **Export** (or `E`) for PNG / PDF / `.pptx`.
