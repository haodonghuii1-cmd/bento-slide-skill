# Tech notes: rendering dense, precise data-viz tile art in a 16:9 HTML slide

## Recommendation

**Primary stack: Canvas2D at exact device pixels for the marks, HTML for every piece of real text, no libraries.** One small runtime (`viz/bento-viz.js`, ~18 KB minified) draws each chart recipe into its own canvas. Fonts are inlined. The whole proof is **~105 KB raw / ~65 KB gzip**, and opening it makes no network requests.

**Why this one:**
1. **Crisp by construction.** The backing store is the CSS box × DPR (read from `devicePixelContentBoxSize` when it agrees with `devicePixelRatio`), so nothing is ever resampled. Hairlines are snapped to device pixels. The 2× crops in `qa/*-zoom-*.png` show round dots and 1-device-px ticks.
2. **Fast at this density.** The proof draws ~5,000 dots and ~250 ticks. Batched into `Path2D` buckets by color × alpha, all charts together take **≈ 3.5 ms/frame during the reveal**. Once settled, only the hero redraws, at **≈ 1 ms per frame (30 fps cap)**. That's measured in headless Chrome at DPR 2.
3. **Theming is free.** Every mark is `rgba(var(--mark), α)` or `rgba(var(--accent-rgb), α)`, read from CSS tokens. Light/Dark/Keynote is a repaint.
4. **Generatable.** A recipe is ~60 lines of plain code configured by `data-*` attributes. The agent writes data into HTML, not geometry.
5. **Text stays text.** KPIs, legends, readouts, and copy are HTML (selectable, accessible, and subpixel-rendered). Only tiny axis labels are drawn in canvas, using the inlined mono font.

## Stack comparison (honest)

| Option | Crispness | Perf at 1k–20k marks | Animation | Size | Agent cost | Verdict |
|---|---|---|---|---|---|---|
| **Canvas2D @ DPR** | Perfect if the backing store = device px; text in canvas is fine for tiny labels | Excellent with batching (Path2D per alpha bucket) | Full control in one rAF loop; per-dot reveal is cheap | 0 KB lib | Low | **Primary** |
| SVG (inline, one `<circle>` per dot) | Perfect: vector, any zoom, print-perfect | OK to ~2–3k nodes. Per-dot animation of 5k nodes janks (style/layout per node). | CSS/SMIL per node is heavy at this count | 0 KB lib; ~60–100 bytes per dot in the HTML (~0.5 MB for the proof) | Low | Good for **static** charts under ~2k marks, or print/PDF export. Not for the dense animated hero. |
| SVG + D3 | Same as SVG | Same as SVG | Nice transitions | +~90 KB | Medium | Adds nothing a slide needs. |
| WebGL (regl / three points / custom shader) | Perfect with DPR | Best: 100k+ points at 60 fps | Shader-driven | +20–600 KB | Medium-high | Only past ~50k animated marks. Text, hairlines, and snapping are harder; context limits apply (~16/page). Overkill here. |
| CSS grid of divs | Fine | Poor past ~1k elements | CSS only | Large DOM | Low | ❌ |
| Pre-rendered PNG/AVIF | Only at the rendered size; soft on zoom or other DPR | n/a | None | 50–300 KB per tile at 2× | Low | Fallback for email or thumbnails only. Violates "never blurry" on other screens. |
| Lottie | Vector, but the player rasterizes per frame; dense dots get heavy | Poor at thousands of shapes | Good, but authored | +~250 KB player | High | ❌ |

**Hybrid rule:**
- **Canvas** for marks (dots, ticks, gridlines, glow).
- **HTML** for anything a person reads as content.
- **SVG** for icons.
- Use **WebGL** only if a future recipe animates > 50k marks.

## What makes it look like the reference (and not like a generic chart)

| Lever | Setting in the proof |
|---|---|
| Density from alignment | Dot pitch 0.3–0.36cqw, radius 0.25 × pitch; polar charts on 144 spokes × concentric rings; 121-tick gauges |
| Alpha ladder instead of hues | 0.95 / 0.5 / 0.16 for nested series; tips fade to ~0.45; forecast at 0.17 |
| One warm signal | Coral accent only on the anomaly (and one tiny secondary mark), with a gaussian glow at 0.20 (dark) / 0.12 (light) |
| Mono details | Geist Mono for timestamps, axes, chips, and "1 dot = …" |
| Calm surfaces | Near-black or off-white tiles, 1px hairline edges, ≥ 30% empty area per tile |
| Motion that explains | The sweep hand lays down the day's dots; columns grow in reading order; nothing loops except the glow breath and the Live ping |

## Light vs. Dark translation

- **Same geometry, same alpha ladder.** Light adds `--mark-k: .9`, because dark ink on white reads heavier.
- **The accent is deepened** for text contrast (`#cf3d2f` on paper vs. `#ff5a4d` on black).
- **The glow composite flips:** `lighter` on Dark (it adds light) and `source-over` on Light (it tints). `lighter` on white just disappears or washes out.
- **Shadows** exist only on tiles in Light (soft and long), never on marks.

## Style chooser (short)

- **Keynote:** every art tile is covered by matching supplied art.
- **Dark:** art is missing, and the product is data, infra, AI, dev tools, security, or fintech, or it's a tie.
- **Light:** art is missing, and the brand reads bright, editorial, or print, or the deck is light.

Always state the pick and its reason in one line. One file carries all three (`data-theme`).

## Limits and honest gaps

- **Canvas text isn't selectable.** That's why only tiny axis and tick labels live there; anything meaningful is HTML or sits in the chart's `aria-label`.
- **Print/PDF:** text is vector, and charts are 2× raster: on `beforeprint`, the exporter overlays `snapshot(2)` images on the charts. Fully vector *charts* would need an SVG twin of each recipe, which isn't built. See "Export" below.
- **There is no poster fallback.** If JavaScript is off, tiles show copy and KPIs but no marks. That's acceptable for a slide; flag it if the target is an email client.
- **Real-GPU and Safari checks are still owed.** Measurements are headless Chrome on Linux. The code paths (`roundRect`, `devicePixelContentBoxSize` with fallback) are standard, but test on Safari/macOS before a keynote.
- **The proof's numbers are sample data** (Relay is a placeholder product). The recipes are built to take real series.
- **Two runtimes, one contract.** `bento-viz.js` (proof recipes) and `edge-viz.js` (edge recipes) are forks of the same core. Merging them into one library file with per-slide tree-shaking at build time is the next cleanup; until then, copy recipes across by block.

## Layouts and recipes beyond the proof

- **Partitions are pure CSS.** A preset is one `grid-template-areas` block on a 12 × 6 grid plus a hide rule for extra tiles. `bento-shell.html` now has `C5`, `M5`, `T5` and `S4` alongside the originals. A new one costs about 4 lines, so invent one rather than forcing content into L5.
- **Recipes are portable by copy.** `edge-ai-bento/viz/edge-viz.js` uses the same runtime as `bento-viz.js` (Chart lifecycle, `paintDots`, `snap`, `chip`, `glow`) and adds `paintRects`, a rounded-rect twin of `paintDots` with the same reveal/bucket contract (used by `film-strip`). To reuse a recipe on another slide, copy its `RECIPES[...]` block and any helper it calls. The two files aren't merged yet (see gaps).
- **Shared hover dimming:** `dimHover(c, k)` returns the standard "hovered group bright, others dim by k" alpha function, so new recipes don't each re-derive it.
- **Measured (edge v2, headless Chrome, DPR 2):** ~3,600 marks in total (die-map ~2,550, power-steps ~780). The file is 104 KB raw / 63 KB zipped and every canvas reports scale = DPR.

## Export (in-page, offline; SKILL.md §13)

**Pipeline:** `bentoViz.snapshot()` → clone the stage → `<foreignObject>` SVG → canvas → encoder. `export/bento-export.js` is ~26 KB unminified, with no dependencies.

1. **Settled charts at export resolution.** `bentoViz.snapshot(scale, 1920)` makes a throwaway `Chart` per chart (`Object.create(Chart.prototype)` plus overrides). It has a new canvas sized `box × (1920 / stage.clientWidth) × scale`, `cq = 19.2`, a fresh `palette()` for the current theme, no hover, and empty `state`. It runs `layout()` then `draw({ p: 1, t: 0, f: 1 })`. All geometry is in cq units, so the result matches a 1920-wide stage exactly. Live canvases are never touched or upscaled.
2. **Theme round-trip in one task.** For each theme: set `data-theme`, snapshot, `cloneNode`, and swap each clone's canvas for an `<img>` of its snapshot. Then restore the theme. There's no paint in between, so nothing flickers. `data-exporting` stops the theme observer from replaying the intro. ResizeObservers see no net change.
3. **Rasterize.** The wrapper is `div.bx-root[data-theme][data-tone]` holding the page's own `<style>` text, plus overrides: animations and transitions off, tiles at their final state, no pointer light, stage fixed at 1920 px. `:root {` is rewritten to `:root, .bx-root {` because tokens defined on `:root` would otherwise land on the `<svg>`. The wrapper is serialized with `XMLSerializer` into an `<svg width=1920·s viewBox=0 0 1920 1080><foreignObject>`, loaded as a data URL, `decode()`d, and drawn onto a canvas. Chrome rasterizes the foreignObject at the destination size, so the text is genuinely 2×, not upscaled.
4. **Encoders, all hand-written:**
   - **ZIP:** STORE only, CRC-32 table, UTF-8 names. PNG and JPEG are already compressed.
   - **PDF 1.4:** a 1920×1080 pt page per image, holding a DCTDecode JPEG at q.95.
   - **PPTX:** a minimal PresentationML package. It has a content-types file, one master, one blank layout, a theme with the required clr/font/fmt schemes, and per slide one `p:pic` (full-bleed, `descr` = slide copy). It is stored in the same ZIP writer.

**Measured (edge v3, headless Chrome 156, 2×):**
- **Fidelity:** in-page PNG vs. Chrome's own screenshot at DPR 2 gives a mean |Δ| of 0.07/255 (Light and Dark) and 0.00/255 (Keynote), with 0 px off by more than 32. The bento-proof shell gives 0.08.
- **File sizes:**
  - PNG: ~2.1 MB per theme
  - zip of all three themes: 5.4 MB
  - PDF of all three themes: 2.8 MB
  - `.pptx`: 5.4 MB
  - vector PDF: ~0.95 MB per theme
- **Capture time (headless Chrome, this container):** 0.45 s for one PNG, 0.96 s for the 3-slide `.pptx`.
- **PPTX checks:** python-pptx reads 3 slides at 12192000×6858000 EMU. LibreOffice converts it to a 3-page PDF.

**Not verified here:** opening in real Keynote or PowerPoint (no macOS in this environment), and the in-page capture in Safari and Firefox. The format choices are deliberately the most conservative ones (STORE zip, PDF 1.4 + JPEG, a pptxgenjs-shaped package), but run one real Keynote open before relying on it for a keynote.

**Rejected:**
- **A hand-built `.key`:** proprietary IWA/protobuf with no spec, so it would be fragile.
- **html2canvas:** it re-implements CSS, so `cq` units, gradients and outlines drift, and it adds ~45 KB.
- **pptxgenjs inlined:** ~470 KB for what is about 60 lines of XML here.
- **Upscaling live canvases:** soft output.

## Retired

The Three.js studio-object pipeline (Tier R/P, posters, material cheat sheet) is in `_archive-3d/`. It isn't used by Light/Dark any more. It could come back only for a Keynote hero when the user supplies a `.glb`.
