---
name: bento-slide
description: Turn a product brief (plus whatever artwork exists) into one 16:9 bento-grid summary slide, delivered as a single self-contained HTML file. Three styles — Keynote (Apple summary slide, supplied art), Light and Dark (missing art becomes dense, precise data visualization in a dot-matrix / hairline language with one accent color) — rendered crisp in Canvas2D at device DPR. Nine grid partitions and a growing chart-recipe library; every slide must differ in grid and chart set from the previous one unless the user asks otherwise. Every slide ships with offline export built in: 2× PNG, all-theme PNG zip, 16:9 PDF, a Keynote/PowerPoint-ready .pptx, and print-to-vector-PDF.
---

# Bento Slide Playbook

**What it makes:** one 16:9 slide, delivered as one `.html` file that works offline. The slide is an asymmetric bento grid with a clear hero, short copy, precise data-viz tile art, and restrained motion.

**Art direction (current):** when art is missing, Light and Dark tiles are filled with **detail-rich data visualization**, not 3D objects. The north star is `dataviz-ref.jpg`, a fintech dashboard with:
- a radial dot-matrix clock (1 dot = 50 attempts) with fine ticks and hour labels
- a big centered KPI
- one coral anomaly cluster with a faint glow
- micro sparkline bars, a monospace timestamp, and a legend row

Detail comes from **data density and precision**: thousands of small, well-aligned marks. It does not come from object count, materials, or lighting. The previous 3D studio-object direction is retired; it is archived in `_archive-3d/` for reference only.

**The reference defines a *language*, not a chart set.** Copy its marks (dots, hairlines, fine ticks, mono labels, alpha ladder, one warm signal), never its specific shapes. A slide that re-uses the radial clock + histogram + gauge + calendar of the proof is a clone, even with different numbers. See §6.4 (variation rules).

**Reference implementation in this folder:**

| File | What it is |
|---|---|
| `bento-shell.html` | 16:9 shell: tokens for all three themes, layouts, tile anatomy, motion, the theme switch. Loads `fonts/` and `viz/` by URL for dev. |
| `viz/bento-viz.js` | Viz runtime (~18 KB min, no dependencies): one Canvas2D per chart at exact device pixels, the recipe library (§7.4), reveal/hover/ambient loop |
| `fonts/inter.woff`, `fonts/mono.woff` | Inter + Geist Mono (OFL), Latin subset, ~48 KB total |
| `export/bento-export.js` | **Export module (§13), standard on every slide.** It adds an Export menu to the theme pill: PNG, PNG zip, PDF, .pptx for Keynote, and Print. Everything is encoded in the tab with no dependencies (~26 KB unminified). It needs the runtime's `bentoViz.snapshot()`. |
| `build/build.mjs` | Inlines the fonts and every `<script src>` into the shell, giving one offline file (`node build.mjs [shell] [out]`, default `dist/bento-slide.html`). It fails if any external reference survives. It does not minify, because esbuild isn't available offline. The output is ~145 KB, ~70 KB gzip. |
| `build/export.mjs` | Batch export through headless Chrome over CDP, with no npm dependencies. It produces the in-page formats plus Chrome-native `vector-pdf` and `screenshot`, and logs console errors and network requests. **This is also the QA shooter:** `--formats=screenshot` gives the three theme captures. |
| `build/shoot.mjs` | The older QA shooter (reduced motion, hover, 1:1 zoom crops, frame checks). **It is not in this folder.** Until it's restored, use `export.mjs --formats=screenshot` and crop the zooms from the 2× PNGs. |
| `qa/*.png` | Reference captures. **Look at `*-zoom-*.png` before writing a new recipe: they are the quality floor.** |
| `../edge-ai-bento/` | Second reference (v2): layout **C5**, strip/tower/column-hero anatomies, recipes `die-map`, `frame-stems`, `power-steps`, `film-strip`, `drift-bars` in `viz/edge-viz.js` (same runtime contract, portable by copy). |
| `SLIDES.md` | **Slide registry:** layout + recipe set of every slide built with this skill. Read it before §5 step 4; append to it at delivery. |

---

## 1. When to use

**Use it for:** launch recaps, "what's new" slides, feature summaries, capability or metrics overviews in a pitch deck, and one-screen hero sections.

**Don't use it for:**
- **multi-slide decks:** run the skill once per slide and share the tokens
- **live dashboards:** this is a slide that *looks* like precise instrumentation, not an app
- **more than 12 messages:** split into two slides, since density kills hierarchy
- **mascots, characters, illustration, or 3D objects** in Light/Dark: out of scope by design

---

## 2. Inputs

```yaml
product: "Relay"                         # required
slide_title: null                        # optional — the hero is usually the title
style: auto | keynote | light | dark     # default auto → §3
tone: dark | light                       # keynote only (Apple ships both)
accent: "#ff5a4d"                        # optional; ONE color. Must pass contrast on the chosen theme (§7.1)
tiles:                                   # required, 4–12
  - role: hero | stat | feature | ui | media | list | quote
    eyebrow: "Latency"                   # ≤ 3 words
    title:   "Fast on every channel"     # ≤ 5 words (keynote: ≤ 4)
    body:    "Median 92 ms from API call to device."   # ≤ 14 words
    stat:    { pre: "Up to", num: "3×", label: "faster delivery" }
    data:    { … }                       # optional real numbers for the tile's chart (§7.5)
    chart:   auto | <any recipe in §7.5>      # auto → §7.5 casting + §6.4 variation rules
    art:     path | video.mp4 | null     # null → generate a chart (§5)
    priority: 1
logo: path | null
layout: auto | L4 | L5 | L6 | C5 | M5 | T5 | S4 | L9 | K12   # auto → §6.2 by content shape + §6.4
same_as: null | <slide name>             # ONLY set when the user explicitly asks to match an existing slide's grid/charts
```

**Asset manifest (always do this first).** For every upload, record its pixel size, alpha, dominant colors, background, render type (photo, render, UI capture), and which tile it belongs to. Then score coverage: **covered tiles ÷ tiles that need art.** Stat tiles and UI tiles don't need art.

**Data manifest (new, equally important).** For every number in the brief, record:
- the value and unit
- the time window
- whether it's a single figure, a series, a distribution, or a share

That list decides the charts (§7.5). Numbers are the raw material for the art now.

---

## 3. Style decision tree

```
Is every art-bearing tile covered by supplied art that matches in lighting, background and quality?
├─ YES ──────────────────────────────────────────────► A · KEYNOTE
│        (tone = the art's background: black studio → dark, white/grey studio → light)
└─ NO (≥1 tile needs generated art)
   ├─ User said light / dark? ───────────────────────► honor it
   ├─ Product is data, infra, AI, dev tools, security, fintech, analytics ─► C · DARK
   ├─ Brand reads bright, calm, editorial, print-like, or the slide goes in a light deck ─► B · LIGHT
   └─ Still tied ───────────────────────────────────► DARK (the reference's home), and tell the user
```

**Tie-breakers and edge cases**

| Situation | Decision |
|---|---|
| Full art, but one or two tiles are weak | Stay **Keynote**. Turn the weak tiles into stat tiles with a tick gauge or sparkline. Never put a generated photo-like image next to product photography. |
| Partial art mixed with generated tiles | **Light or Dark.** Supplied product shots sit inside a tile with the theme's surface and no glow; charts fill the rest. Supplied **screenshots** of real product UI are welcome; they share the language. |
| The brief has no numbers at all | Still **Light or Dark**, but ask for 3–5 real figures first. If none come, use clearly labeled sample data (`"sample data"` in the caption) and say so in the delivery note. **Never present invented numbers as real.** |
| Brand color is loud (lime, magenta) | Use it as the single accent only if it passes §7.1 contrast. Otherwise fall back to coral (dark) / deep coral (light) and tell the user. |
| The user wants both | Build one file. The theme switch is `data-theme`; charts repaint from tokens; copy and layout stay identical. |

**Say the choice out loud.** Before building, give one line, for example: *"Going Dark: 4 of 5 art tiles are missing, the product is infra, and the brief has 9 real figures to chart. Say 'light' to flip it."*

### What each style looks like

| | A · Keynote | B · Light | C · Dark |
|---|---|---|---|
| North star | Apple event summary slides | `dataviz-ref.jpg`, translated to paper | `dataviz-ref.jpg` |
| Surfaces | Supplied renders on `#161618` / white | Off-white cards `#fcfcfb` on `#efeeeb`, hairline edge, soft shadow | Near-black cards `#151517→#111113` on `#09090a`, 7% white hairline |
| Marks | Supplied art | Dark grey `rgb(28 28 32)` at 0.1–0.95 alpha | Near-white `rgb(236 236 240)` at 0.1–0.95 alpha |
| Accent | Apple blue for eyebrows | One deep coral `#cf3d2f`, data only | One coral `#ff5a4d`, data only, the only glow |
| Density | 9–16 tiles, tight gaps | 4–6 tiles, generous air | 4–6 tiles, generous air |
| Motion | Entrance + hover lift | Entrance, dots fill in, sweep hand, chart hover | Same, plus the accent glow breathing |

---

## 4. Art tiers

Every tile that needs art gets a tier **before** generation. Record it as `data-tier` in the build plan.

| Tier | What it is | Use for |
|---|---|---|
| **V · Viz** | A chart recipe drawn by `viz/bento-viz.js` in Canvas2D at device DPR | **Default for every missing art tile in Light and Dark.** Hero, feature, and stat tiles. |
| **U · UI** | Live HTML/CSS mock: KPI cards, chips, legends, tooltips, a "Live" pill | Product UI moments; numbers that must be selectable or accessible text |
| **S · Supplied** | User art (photo, render, screenshot, video) | Keynote; or one tile in Light/Dark where a real product shot is better than a chart |
| **F · Glyph** | Inline SVG icon ≤ 2cqw | Icons beside labels only |

There is no poster tier any more. Canvas2D exists in every browser that can render the slide. The no-JS case is covered by layout and copy: every tile still reads, with KPI numbers in HTML.

---

## 5. Pipeline

1. **Parse** the brief into the §2 schema. Build the asset manifest **and the data manifest**.
2. **Choose a style** with §3 and say it in one line.
3. **Edit the copy** to the §6.3 limits. Rewrite; don't truncate.
4. **Pick a layout** from §6.2 by content shape (tile count, hero shape, which tiles want panoramic vs. portrait charts), **then run the §6.4 variation check against `SLIDES.md`** and any slide the user mentions or that sits in the same folder/deck. Say the pick in the style line: *"Going Dark, C5 column hero; previous slide was L5."* Assign `--i` (entrance order) by priority.
5. **Cast the charts:** map each tile's data to a recipe with §7.5, choosing from **different families** (§7.5 families table) and obeying §6.4.
   - Choose **one** anomaly or highlight for the whole slide. It gets the accent.
   - Allow at most **one** other small accent mark elsewhere.
6. **Fill the data attributes.** Prefer real series: `data-hourly`, `data-bins`, `data-values`. Derive fine bins from coarse data only with seeded jitter, and disclose it (§7.5).
7. **Assemble:** copy `bento-shell.html`, set `data-theme`, `data-layout` and `<meta name="bento-slug">`, then fill the tiles. Keep the `export/bento-export.js` script tag; export is not optional (§13). Then run `cd build && node build.mjs <shell> <out>`.
8. **QA:** `node shoot.mjs`, then check every item in §11, **including the 1:1 zoom crops.** Expect 2–4 passes. The usual fixes are collisions between labels, and an accent that crept into a second place.
9. **Deliver** three things:
   - the single `.html` file, with the Export menu working offline (§13)
   - a PNG at 2×, made by the slide's own exporter: `node build/export.mjs <html> --formats=png-all,pptx`. Add `pdf` and `vector-pdf` if the user presents from Keynote or PDF.
   - a three-line note: the style chosen, which numbers are real vs. sample, and what's placeholder
10. **Register** the slide: append one row to `SLIDES.md` (name, date, layout, hero recipe, tile recipes, accent location).

---

## 6. Layout rules

### 6.1 Stage
- A fixed **16:9 stage**, `width: min(100vw, 100dvh × 16/9)`, letterboxed on `--page`. **Never scrolls.**
- All sizes are in **`cqw`** (stage container units), so the slide scales as one picture. `1cqw ≈ 19.2px` at 1920. **Chart geometry uses cqw too** (dot pitch, label size), so mark counts and proportions stay identical at every viewport.
- The grid is **12 columns × 6 rows** inside `--pad`. Tiles span whole cells only.

### 6.2 Layout presets (in `bento-shell.html`)

There is **no default layout.** Pick by content shape, then check §6.4. Grids are 12 × 6; hero % = share of the 72 cells.

| Preset | Tiles | Shape (cols × rows) | Hero | Tile aspects it creates | Use when |
|---|---|---|---|---|---|
| `L5` · Split deck | 5 | 7×3 hero + 5×3 side, then three 4×3 | 29% landscape | all ~landscape, near-equal | A wide hero chart (radial / area) + four balanced peers. **Used by bento-proof.** |
| `C5` · Column hero | 5 | 4×6 tall hero left · 8×2 panorama · 3×4 tower · two 5×2 strips | 33% portrait | portrait, panoramic, tower, strip (4 sizes) | Hero is a **title + one tall/square chart** (floorplan, matrix, stacked list). One metric wants a long time axis (panorama). **Used by edge-ai-bento v2.** |
| `M5` · Masthead | 5 | 12×2 banner hero on top · 5×4, 4×2, 4×2, 3×4 below | 33% banner | banner, square-ish, strips, tower | Hero is a **long horizontal story** (timeline, throughput over a day, a pipeline). Title left, chart runs the full width. |
| `T5` · Triptych | 5 | 4×6 hero in the **center**, 4×2 + 4×4 left, 4×4 + 4×2 right | 33% portrait | pinwheel: short/tall alternate | A symmetric product/core metric with supporting evidence on both sides (before/after, input/output). |
| `S4` · Stack | 4 | 4×6 hero left + three 8×2 panoramic strips | 33% portrait | three equal panoramas | Three metrics that are all **time series or sequences** (latency trace, frame strip, uptime row). |
| `L4` · Stagger | 4 | 7+5 over 5+7 | 29% | two landscape sizes | Two strong chart moments |
| `L6` · Even | 6 | 3×2 even | 17% | one size | Feature grids. Hierarchy comes from density, not size. Use sparingly. |
| `L9` | 9 | 6×4 center hero ringed by 8 | 33% | | Keynote, medium density |
| `K12` | 12 | 6×4 center hero, stats around the edge | 33% | | Keynote, dense |

**Inventing a partition is allowed** (and encouraged when none fits): every area must be a rectangle, the hero must be 25–40% of the cells, at least 3 tile sizes for 5+ tiles, and no tile smaller than 3×2 (Light/Dark) or 2×1 (Keynote). Add it to `bento-shell.html` as a new `data-layout` and to this table.

**Tile anatomies** (pick per tile aspect; a slide should use ≥ 2):

| Anatomy | Class | Fits | Structure |
|---|---|---|---|
| Head + chart | `.tile` + `.tile-head` | landscape ≥ 4×3 | copy left, KPI top-right (`.kpi-side`), chart fills below |
| Split hero | `.tile--hero` | wide hero (L5, M5) | copy column left, chart right |
| Column hero | `.tile--column` | tall hero (C5, T5, S4) | meta → big title → body → KPI rule → chart fills → legend + key |
| Strip | `.tile--strip` | 5×2 to 8×2 | copy column left (KPI pinned to its foot), chart column right with mono key below |
| Tower | `.tile--tower` | 3×4, 3×3 | copy top, chart fills middle, KPI + readout foot row |
| Stat | `.tile--stat` | square | number centered in a gauge/ring |

**Hierarchy rules**
- **One hero,** 25–40% of the stage area. In Light/Dark the hero is the **densest chart** (proof: radial clock ~1,100 dots; edge v2: die map ~2,350 dots) plus the largest type.
- **At least 2 tile sizes** (except `L6`); **at least 3** for 5+ tiles in the new presets.
- **No two adjacent tiles from the same chart family** (§7.5). Alternate radial, columnar, grid, linear/stem, and share shapes.
- **Reading order follows `--i`.**

**Geometry tokens**

| | Keynote | Light | Dark |
|---|---|---|---|
| `--pad` | 1.1cqw | 3.2cqw | 3.2cqw |
| `--gap` | 0.85cqw | 1.25cqw | 1.25cqw |
| `--radius` | 1.45cqw | 1.25cqw | 1.25cqw |
| `--tile-pad` | 1.3cqw | 1.9cqw | 1.9cqw |

### 6.3 Copy rules
- **Eyebrow:** ≤ 3 words, sentence case. **Muted grey in Light/Dark** (the accent is reserved for data). Accent-colored in Keynote.
- **Title:** ≤ 5 words (Keynote ≤ 4), sentence case, no final period, `text-wrap: balance`.
- **Body:** ≤ 14 words, one sentence.
- **KPI:** one number per tile at most, top-right (`.kpi-side`), with a mono caption naming its window: `p95 · last 24 h`, `uptime · 90 days`.
- **Units are small and muted:** `180<small>ms</small>`, `99.98<small>%</small>`.
- **Mono** (Geist Mono) for timestamps, axis labels, tooltips, captions, and "1 dot = …" keys. **Sans** (Inter) for everything else.
- **Numbers agree everywhere.** The KPI, the chart, the tooltip, the legend, and `aria-label` must all show the same figures. Check them by hand; it was the most common bug in the proof.

### 6.4 Variation rules (don't clone the last slide)

Two slides from this skill side by side must read as **siblings, not copies**: same tokens, type, marks and accent discipline; different partition and chart shapes.

1. **Never reuse the previous slide's grid without an explicit ask.** "Previous" = the last row in `SLIDES.md`, plus any slide the user names or that sits in the same deck/folder. Only `same_as:` (or the user saying "same layout as …") overrides this.
2. **Change the hero's shape**, not just its data: if the last hero was radial, this one is a grid, matrix, banner timeline, or floorplan, and the hero tile's aspect changes too (landscape → portrait/banner).
3. **Chart overlap ≤ 1 recipe** with the previous slide, and that one may not be the hero recipe. Re-using a whole family set (radial + distribution + gauge + calendar) counts as a clone even if the recipes are new variants.
4. **Max one radial chart per slide** (clock, dial, gauge, ring). Radial reads as "the bento look" fast; it is not the language.
5. **Vary tile anatomy:** at least two anatomies from §6.2 per slide, and at least one tile whose aspect is not ~4:3 (panorama, tower, or strip).
6. **Write the diff in the style line** before building: *"C5 + die-map/frame-stems/power-steps/film-strip/drift-bars; previous (bento-proof) was L5 + radial-clock/dot-histogram/tick-gauge/dot-grid/dot-area. Overlap: none."*
7. When the brief is the same *kind* of data as the last slide (latency again, uptime again), pick the **alternate** recipe from the §7.5 mapping table, not the first one.

---

## 7. Art direction and generation

### 7.1 The five rules (every tile must pass all five)

| # | Rule | In practice |
|---|---|---|
| 1 | **Composition restraint** | **One focal point per tile,** and one hero focal point per slide. A tile is: copy block + **one** chart + at most one KPI and one legend or caption. Leave ≥ 30% of each tile as calm surface. Detail = density of *aligned* marks (dot pitch 0.3–0.36cqw, ticks every 1–2°), **never** more chart types, gradients, or decoration. If a tile needs two charts, it's two tiles. |
| 2 | **Single accent** | Marks are one neutral (`--mark`) at varying alpha. The accent (`--accent`, `--accent-rgb`) appears **only on data that matters**: the one anomaly cluster, its time label, its legend dot, and its KPI word. Allow at most one other small accent mark on the slide (the proof's failover dot). No accent on eyebrows, buttons, gridlines, or titles in Light/Dark. Categories are distinguished by **alpha steps** (0.95 / 0.5 / 0.16), not hues. |
| 3 | **Sharpness / DPR** | Every canvas's backing store = its CSS box × DPR, read from `devicePixelContentBoxSize` when it agrees with `devicePixelRatio`. Never CSS-scale a canvas, never draw to a bitmap and stretch it, never use `filter: blur` on marks. 1px lines are snapped to device pixels (`snap()`). Dots ≥ 0.9 CSS px radius so they survive 1× screens. QA judges sharpness on 1:1 crops at DPR 2. |
| 4 | **Subtle glow** | Exactly one glow on the slide, under the accent anomaly: a radial gradient with gaussian-like stops, peak alpha `--glow` (0.20 dark, 0.12 light), radius ≈ 0.26 × chart radius. Composite: `lighter` on dark, `source-over` on light. Optionally one tiny glow on the secondary accent mark at ≤ 0.7× that. Never glow neutral marks, text, or tile edges. Never white bloom. |
| 5 | **Natural hover** | The tile lifts ≤ 0.1cqw, its hairline edge firms slightly, and a wide (36cqw), dim (dark 3.5% screen / light soft-light), edgeless pool of light follows the pointer with a damped follow (τ ≈ 220 ms). It fades in over 1 s and out over 1.4 s. Inside the chart, hover is **informational**: the hovered wedge or column brightens, everything else dims ≤ 45%, and a mono chip or readout shows the value. All of it eases (τ ≈ 140 ms) and nothing snaps or flashes. |

**Contrast:** text ≥ 4.5:1 on the tile surface, including mono labels and the accent when it's used as text. That's why Light's accent is deepened to `#cf3d2f` (≈ 4.7:1 on `#fcfcfb`). Dark's `#ff5a4d` on `#131315` is ≈ 6:1. Marks are art (`aria-hidden` or inside `role="img"`), so they may go as low as 0.1 alpha.

### 7.2 Dark (north star: `dataviz-ref.jpg`)
- **Surfaces:**
  - page `#050506`
  - stage: a near-black radial gradient
  - tiles `#151517 → #111113`, with a 1px `rgba(255,255,255,.07)` edge and a 0.035 top inner highlight
  - inset panels (KPI cards) at `rgba(255,255,255,.025)`
- **Marks:** `rgb(236 236 240)`. Past/actual data at 0.95 fading to 0.45 toward a column's tip. Forecast or comparison data at 0.16–0.2 and smaller. Gridlines at 0.07–0.09, dashed. Axis baseline at 0.2. Labels in `--muted #8b8b91`.
- **Accent:** coral `#ff5a4d`. Glow `lighter` at 0.2.
- **Feel:** an instrument panel at night. Quiet, precise, one warm signal.

### 7.3 Light (same language, on paper)
- **Surfaces:**
  - page `#e7e6e3`, stage `#efeeeb`
  - tiles `#fcfcfb → #f9f9f7`, with a 1px `rgba(20,20,24,.07)` edge and a soft long shadow (`0 1cqw 2.2cqw -1.3cqw rgba(30,30,40,.14)`)
  - inset panels at `rgba(20,20,24,.025)`
- **Marks:** `rgb(28 28 32)` with `--mark-k: .9`, because dark ink on white reads heavier than light ink on black. Use the same alpha ladder as Dark.
- **Accent:** deep coral `#cf3d2f`. Glow `source-over` at 0.12, which reads as a warm tint, not light.
- **Feel:** a printed annual report or an engineering plot. Don't add drop shadows to marks, and don't tint the paper.

### 7.4 Keynote (supplied art)
- It's unchanged in spirit: an Apple summary slide with supplied renders, tight gaps, and big stat numerals.
- If a Keynote tile has no art, use a **stat tile with a tick gauge or spark bars** in Keynote tokens (marks `#f5f5f7`, accent Apple blue). The proof's Keynote button shows exactly this: the same charts picking up Keynote tokens.
- Never put the dense hero clock next to product photography. In real Keynote use, the hero is the supplied art.

### 7.5 Chart recipe library

All recipes live in `viz/bento-viz.js` as `RECIPES[name] = { dur, ambient?, hover?, layout(c), draw(c, m, s), hover?(c, m, x, y), readout?(c, m, key) }`. They are configured entirely by `data-*` attributes, so the HTML holds the data.

| Recipe | Looks like | Best for (data shape) | Data attributes | Accent use | Proof tile |
|---|---|---|---|---|---|
| `radial-clock` | 24 h dial; one radial column of dots per 10-min bin; inner disk with fine tick ring; hour labels 00/06/12/18; sweep hand to "now"; future bins faint | **A day of volume** with a "now" and one notable moment: requests, payments, deliveries, sign-ins | `data-hourly` (24 values) · `data-scale` (multiplier) · `data-unit` (per dot) · `data-now="HH:MM"` · `data-anomaly="HH:MM"` · `data-anomaly-dots="6,12,14,10,5"` (extra dots per bin, centered on the anomaly) · `data-rings` | Anomaly dots + time label + glow | Hero: 1 dot = 2,000 messages |
| `dot-histogram` | Distribution as stacked dot columns on a ticked axis, with dashed p50/p95/p99 markers; alpha steps by percentile band | **Latency, sizes, durations, scores** (anything with percentiles) | `data-bins` (counts, left→right) **or** `data-median` + `data-p95` (log-normal) · `data-max` · `data-pitch` | None (p95 label in ink) | Latency |
| `tick-gauge` | 240° arc of 121 fine ticks, lit up to the value; majors labeled; inner dotted ring; number in HTML at the center | **One headline multiple or percentage:** "3× faster", "92% coverage" | `data-min` `data-max` `data-value` `data-unit` `data-ticks` `data-major` `data-cy` | None | Throughput 3× |
| `dot-grid` | Calendar heatmap: days × 24 h, dot alpha = volume, weekends dimmer; one accent cell with ring, leader line, and label | **Reliability, activity over weeks,** "every day for 90 days", one incident | `data-days` · `data-today` · `data-hourly` · `data-incident="col,row"` · `data-incident-label` · `data-incident-uptime` · `data-labels="left\|right"` | Incident cell (the slide's one secondary accent) | Always on |
| `dot-area` | Time series as dot columns with nested levels (total ⊃ subset ⊃ sub-subset) at 0.16/0.5/0.95 alpha; dashed gridlines; day ticks; crosshair + chip on a focus column that follows hover | **Funnels over time:** delivered/opened/clicked, visits/sign-ups/paid | `data-hourly` · `data-day-factor` (7) · `data-days` · `data-focus="day,bin"` | None | Insights |
| `spark-bars` | 8–16 thin rounded bars, alpha ramping to "now"; tiny bars collapse to dots | **KPI trend** inside a card: last 12 periods | `data-values` · `data-accent-index` · `data-bar` · `data-gap` | Optional single bar | Hero KPI cards |

**Edge recipes (in `../edge-ai-bento/viz/edge-viz.js`; same contract, copy the block to reuse):**

| Recipe | Looks like | Best for (data shape) | Data attributes | Accent use | Used in |
|---|---|---|---|---|---|
| `die-map` | Chip floorplan: cols × rows blocks, each a sub × sub dot micro-grid, hairline package with fine pins on 4 sides, pin-1 ring; diagonal reveal wave | **Capacity made of units:** TOPS, cores, GPUs, racks, seats, licences; categories by alpha | `data-cols` `data-rows` `data-sub` `data-groups` (blocks per category) `data-names` | None (or one block) | Edge hero: 48 blocks = 48 TOPS |
| `frame-stems` | Lollipop trace: one hairline stem + dot head per event over a short window; dashed median and budget lines | **Per-event latency / jitter**, "every X on time", against a budget or SLO | `data-n` `data-median` `data-spread` `data-max` `data-budget` `data-seed` | None (median label in ink) | Edge latency |
| `power-steps` | Stepped envelope: one band of dot rows per level, width steps up; selected band bright, selector hairline | **Discrete modes / tiers / plans**, "5 modes", "3 tiers" | `data-modes` `data-active` | None | Edge power modes |
| `film-strip` | Contact sheet: rows of 16:9 frame cells with sprocket dots; frames land at true playback speed | **Rates of discrete items** (FPS, req/s, units/min) where "every one delivered" is the claim | `data-fps` `data-rows` | None | Edge 96 FPS |
| `drift-bars` | Two (or more) 100-dot share bars (2 × 50, 1 dot = 1%), hollow rings for the missing share, 0–100% ruler, dashed guide | **Before/after %**, retention, "97% after 60 min", degradation | `data-bars="label:value\|…"` | Last bar's value + end ring + glow | Edge stability (slide's one accent) |

**Chart families.** Each recipe belongs to one family. Use them to satisfy §6.4 and the adjacency rule in §6.2.

| Family | Recipes | Visual signature |
|---|---|---|
| Radial | `radial-clock`, `tick-gauge`, `polar-bars`, `ring-progress` | circles, arcs, spokes (**max one per slide**) |
| Distribution | `dot-histogram`, `beeswarm` | stacked/packed dots on a value axis |
| Calendar / matrix | `dot-grid`, `waffle-timeline`, `contour-dots` | uniform dot fields, cells = time |
| Area / column | `dot-area`, `spark-bars` | dot columns over time |
| Linear / stem | `frame-stems`, `slope-ticks` | hairlines + heads, events in sequence |
| Unit / floorplan | `die-map`, `dot-matrix-share` | grouped blocks, 1 unit = 1 thing |
| Share / comparison | `drift-bars`, `dot-matrix-share` | 100-dot bars, rings for the missing part |
| Step / tier | `power-steps` | bands, levels, a selector |
| Sequence | `film-strip` | rows of discrete cells in playback order |

**Recipes to add when a brief needs them.** Follow the same contract.

| Recipe | Looks like | Best for |
|---|---|---|
| `dot-matrix-share` | 10×10 (or 20×50) unit grid; filled dots = share | "1 in 4", adoption, coverage, % of fleet |
| `polar-bars` | Radial bars per category around a ring, with tick ring | Regions, channels, weekdays (≤ 24 categories) |
| `beeswarm` | Dots packed along one axis, one dot per entity | Customers by size, services by latency, outliers |
| `slope-ticks` | Two tick columns (before/after) joined by hairlines | Before → after comparisons, migrations |
| `waffle-timeline` | One row of dots per period; a gap = an outage | SLAs, streaks, release cadence |
| `ring-progress` | 360 hairline ticks around a KPI, lit to value | Quotas, "4.1M / 10M" (the ref's sidebar meter) |
| `contour-dots` | Dot density field (2D histogram) with a highlighted region | Geography, two-variable correlation |

**Mapping real copy and data into recipes:**

| The brief says… | Data shape | Recipe | How to fill it |
|---|---|---|---|
| "2.1M messages a day", "peaks at 2 pm" | volume over a day | `radial-clock` · alt: `dot-area` (banner), `waffle-timeline` | Hourly counts → `data-hourly`. Choose `data-unit` so the busiest 10-min bin is **10–14 dots** (≈ `peakHourly / 6 / 12`). Put the unit in a visible `1 dot = …` caption. |
| "p95 under 200 ms", "median 92 ms" | distribution | `dot-histogram` · alt: `frame-stems` (per-event trace vs. budget), `beeswarm` | Real histogram → `data-bins`. With only percentiles, pass `data-median` + `data-p95` (log-normal) and label the caption "modeled from p50/p95". |
| "3× faster", "40% cheaper", "92% coverage" | one scalar | `tick-gauge` · alt: `drift-bars` (vs. baseline), `dot-matrix-share` | `min/max` so the value lands at 60–80% of the arc. The number stays in HTML. |
| "99.99% uptime", "every day for a quarter" | daily/hourly status | `dot-grid` · alt: `waffle-timeline` (one row per week) | One column per day. The incident cell holds the **real** timestamp and duration. |
| "41% open rate", "conversion by day" | funnel over time | `dot-area` | Per-bin totals + rates. Focus the column the copy talks about. |
| "+6.8% vs last week" | short trend | `spark-bars` |
| "48 TOPS", "128 cores", "1,000 GPUs" | capacity in units | `die-map` | 1 block = 1 unit; categories by alpha via `data-groups`. Label any split "sample" unless real. |
| "96 FPS", "12k req/s" | rate of discrete items | `film-strip` | One second (or one window) of items; rows = fractions of the window. |
| "5 power modes", "3 plans" | discrete tiers | `power-steps` | Band widths are **relative and illustrative** unless real figures exist; say so in the key. |
| "97% after 60 min", "retains 92%" | before/after share | `drift-bars` | Real start and end only; don't invent the curve in between. | The last 12 periods. Last bar brightest. |
| "1 in 4 teams", "used by 60% of the Fortune 500" | share | `dot-matrix-share` | 100 dots; fill = share. Accent only if it's the slide's story. |
| A spike, outage, fraud burst, or record | event | Accent on that recipe's anomaly | Only **one** per slide. Label it with a mono time and a plain-words cause in the KPI card. |

**Honesty rules:**
- **Real numbers stay exact.** Only *fine-grain shape* may be synthesized, using seeded `rng()` jitter of ≤ ±7% to break up identical neighbors. It must be disclosed in the delivery note, and with "sample data" in a caption when the source totals are invented too.
- **Units must be stated** in a visible key (`1 dot = 2,000 messages`).
- **Totals reconcile.** Dots × unit ≈ the KPI, within the jitter.

### 7.6 Chart spec template (write this before coding a new recipe)

```yaml
tile: e · Insights
recipe: dot-area
question: "When do people open messages?"      # the one thing the chart answers
focal: Thu 08:00 column, 46% opened             # what the eye lands on first
data: hourly volume × day factor; open 41±5%, click 9±2%   # source + what's real vs. derived
marks: 84 cols × ≤ 34 rows, pitch 0.36cqw, r = 0.25 × pitch, ~950 dots
levels: delivered .16 · opened .5 · clicked .95
labels: day names (mono .52cqw), gridlines dashed at 25/50/75/100%
accent: none
reveal: columns left→right over 60% of 1.7 s, dots bottom→top
hover: crosshair + chip eases to hovered column; returns to focal on leave
copy zone: top (head), legend bottom
```

### 7.7 Recipe-writing rules (learned on the proof)
1. **Geometry in cqw, counts from data.** Pitch, label size, and dot radius are `× c.cq`. The number of marks comes from the data, never from the pixel width.
2. **Batch marks by color × alpha** (`paintDots` uses 48 alpha buckets → one `Path2D` each). Per-dot `fill()` is 10× slower.
3. **Labels never collide with data.** Reserve label bands (`top`, `axisH`) in layout, and keep the chart's labels inside its own canvas. Check corners: captions belong where the chart is empty (the hero's caption sits bottom-right, off the dial).
4. **Center text vs. tick rings:** the KPI inside a dial must clear the innermost tick by ≥ 0.4cqw.
5. **One recipe, one question.** If you're adding a second series, it must nest (as in `dot-area`) or be a faint comparison (as in the forecast), never a competing hue.
6. **Seeded randomness only** (`rng(seed)`), so reloads, QA, and exports match.

---

## 8. Tech stack (summary; details in `TECH-NOTES.md`)

- **Canvas2D at device DPR** for marks. It's crisp, fast for 1k–20k marks, and has zero dependencies.
- **HTML** for copy, KPI numbers, legends, the "Live" pill, and center readouts: real text that's selectable and accessible.
- **Canvas text** only for tiny axis and tick labels, using the inlined mono font, which is loaded explicitly before the first paint.
- **SVG** only for icons. **WebGL** only past ~50k animated marks (not needed for slides).
- **Fonts:** Inter + Geist Mono subset, inlined (~62 KB as base64), so every machine renders identically offline.

---

## 9. HTML structure and CSS variables

### 9.1 Skeleton

```html
<html data-theme="light|dark|keynote" data-tone="dark|light">
<main class="stage" aria-label="Product — summary slide">
  <section class="bento" data-layout="C5">   <!-- example only: pick per §6.2 + §6.4, never by habit -->
    <article class="tile tile--hero" style="--i:0">
      <div class="hero-copy">
        <div class="meta"><span class="live"><i></i>Live</span><time class="mono">Tue 27 Oct · 14:20 CET</time></div>
        <h2 class="title">One API for every channel</h2>
        <p class="body">…</p>
        <ul class="legend"><li>Delivered</li><li class="l-faint">Forecast</li><li class="l-acc">Auto-retried</li></ul>
        <div class="kpis">
          <div class="kpi"><p class="kpi__label">…</p><p class="kpi__num num">1.09M</p><p class="kpi__delta">…</p>
            <div class="viz" data-chart="spark-bars" data-values="3,3,…,15" aria-hidden="true"></div></div>
        </div>
      </div>
      <p class="caption mono">1 dot = 2,000 messages</p>
      <div class="viz viz--clock" data-chart="radial-clock" data-hourly="…" data-unit="2000" data-now="14:20"
           data-anomaly="02:14" data-anomaly-dots="6,12,14,10,5" role="img" aria-label="…one-sentence summary with the real numbers…">
        <div class="viz-center"><p class="num">99.98<small>%</small></p><p class="mono" data-readout>delivered today</p></div>
      </div>
    </article>
    <article class="tile" style="--i:1">
      <header class="tile-head"><div>eyebrow · title · body</div><div class="kpi-side">…</div></header>
      <div class="viz viz--fill" data-chart="dot-histogram" data-median="92" data-p95="180" data-max="400" role="img" aria-label="…"></div>
    </article>
    …
  </section>
</main>
<nav class="theme-switch">Light / Dark / Keynote</nav>   <!-- presenter aid; ?ui=0 or print hides it. bento-export appends "Export" -->
<script src="viz/bento-viz.js"></script>                 <!-- build.mjs inlines it (and the fonts) -->
<script src="export/bento-export.js"></script>           <!-- §13: always included, always after the runtime -->
```

**Hooks**

| Hook | Values |
|---|---|
| `data-theme` | `light` · `dark` · `keynote` (+ `data-tone`) |
| `data-layout` | `L4` · `L5` · `L6` · `C5` · `M5` · `T5` · `S4` · `L9` · `K12` |
| `.viz[data-chart]` | A recipe name. The runtime prepends `canvas.viz__cv`. |
| `[data-readout]` | Text the chart rewrites on hover (restored on leave) |
| `role="img"` + `aria-label` | On every chart that carries meaning: one sentence with the real numbers. Decorative sparklines are `aria-hidden`. |
| `--i` | Entrance order. Chart reveal starts at `120 + i·90 + 280 ms`, synced to the CSS stagger. |
| `?theme=` `?tone=` `?layout=` `?ui=0` | URL overrides |
| `<meta name="bento-slug">` | Base name for exported files (`<slug>-dark@2x.png`, `<slug>-keynote.pptx`) |
| `data-export="hide"` | Anything inside `.stage` that must not appear in exports (presenter notes, debug marks). UI outside `.stage` is never captured anyway. |
| `?export=png\|png-all\|pdf\|pptx` `?scale=1..3` | Run one export on load / override the export scale (default `max(2, DPR)`, capped at 3) |
| `E` key | Opens the Export menu (not under `?ui=0`) |
| Console | `bentoViz.stats()` (CSS size, device scale, marks, frames, ms) · `bentoViz.settle()` · `bentoViz.pause()` |

### 9.2 Tokens

Each theme defines all of these:

```
--page --stage --tile-bg --inset-bg --tile-border --tile-border-hover --tile-shadow --tile-shadow-hover
--ink --muted --eyebrow --chip-bg --chip-border
--mark (rgb triplet) --mark-k --accent --accent-rgb --glow --glow-blend
--ambient --stat-fill --pointer --pointer-a --pointer-blend
--pad --gap --radius --tile-pad  --fs-*  --font --mono  --ease --ease-soft --stagger --enter-dur
```

**`--mark` and `--accent-rgb` are load-bearing.** Every mark the runtime draws is `rgba(var(--mark), α·--mark-k)` or `rgba(var(--accent-rgb), α)`. Switching themes is a repaint, never a rebuild.

---

## 10. Motion checklist

- [ ] **Entrance:** tiles fade and rise 0.9cqw over 900 ms, staggered 90 ms by `--i`. (No CSS blur: it softens canvases mid-reveal.)
- [ ] **Chart reveal** starts as its tile lands:
  - **Hero:** the hand sweeps 00 → now (ease-in-out, 1.5 s), and each dot lands as the hand passes it (scale 0.35 → 1, alpha 0 → 1, ease-out). Forecast dots fade in last, then the anomaly pours outward with its glow.
  - **Others:** columns grow left → right and dots stack bottom → top. Gauges light tick by tick.
  - The whole slide settles in **≤ 3 s.**
- [ ] **Ambient** (after the reveal), and nothing else:
  - the accent glow breathes ±12% over 9 s
  - the "Live" pill pings every 2.8 s (the one fast loop, 0.36cqw, 35% → 0)
  - the stage gradient drifts over 24 s
- [ ] No spinning, bouncing, counting-up numbers, or flashing. Numbers in HTML are static.
- [ ] **Hover:** see §7.1 rule 5. Chart highlights ease in about 140 ms and readouts swap text.
- [ ] **Theme switch replays the entrance.** Any real `data-theme` change (buttons, `T`) restarts the `tile-in` animations and calls `bentoViz.replay()`, which re-times every chart's reveal from now. The result looks like a fresh load. Re-selecting the current theme does nothing, and `?theme=` on load is just the first load.
- [ ] `prefers-reduced-motion: reduce`: CSS animations off. Charts paint their final state once, with no ambient. Hover readouts still work but without easing. A theme switch only repaints, with no replay.
- [ ] The loop sleeps when nothing is revealing, easing, or breathing. Only the hero redraws when idle (30 fps cap), and everything pauses when the tab is hidden.

---

## 11. QA checklist

Run `cd build && node build.mjs && node shoot.mjs`, then review `qa/*.png`:
- `light`, `dark`, `keynote`
- `*-reduced`
- `*-hover`
- `*-zoom-hero` and `*-zoom-tiles` (1:1 device-pixel crops at DPR 2)
- `frame-1440x900`, `frame-1280x720`

The log prints scroll size, stage size, per-chart CSS size and device scale, mark counts, console errors, and any network request.

**Frame**
- [ ] Exactly 16:9 at 1920×1080, 1440×900 (letterboxed), and 1280×720. No scroll.
- [ ] Every chart reports `scale` = DPR (±0.01). A 1.0 at DPR 2 means a blurry canvas; see gotcha 1.

**Variation (§6.4)**
- [ ] Layout differs from the last `SLIDES.md` row (unless `same_as`). Hero tile aspect and hero chart family differ too.
- [ ] ≤ 1 recipe shared with the previous slide, and it isn't the hero's. ≤ 1 radial chart on the slide.
- [ ] ≥ 2 tile anatomies; at least one panorama, tower, or strip tile.
- [ ] Put the two slides' PNGs side by side: would a viewer call them "the same slide with new numbers"? If yes, change the partition first, then the charts.

**Hierarchy and copy**
- [ ] The hero is obvious within 1 second; the densest chart is in the hero.
- [ ] Copy is within the §6.3 limits; no widows.
- [ ] **Numbers agree** across the KPI, chart, tooltip, legend, and `aria-label`.
- [ ] Contrast ≥ 4.5:1 for all text, including mono labels and accent text.

**Art (§7.1)**
- [ ] **Restraint:** one chart per tile, ≥ 30% calm surface, and no label touching data or another label (check the zoom crops).
- [ ] **Single accent:** count the accent uses: one anomaly, plus ≤ 1 small secondary. No accent eyebrows in Light/Dark.
- [ ] **Sharp:** on the 1:1 crops, dots are round, hairlines are 1 device px or crisp 2, text has no halo, and nothing is resampled.
- [ ] **Glow:** only under the accent. Dark: soft warm haze, no white core. Light: a tint, not a light.
- [ ] **Hover:** the pointer pool is barely perceptible, with no hotspot. Chart highlight is subtle, and the readout is correct.
- [ ] Side by side with `dataviz-ref.jpg` at the same size: same family? Look for a calm surface, precise marks, one warm signal, and mono details.

**Technical**
- [ ] One `.html` file, **zero network requests** (the shooter logs any). Fonts are inline.
- [ ] No console errors or warnings.
- [ ] The theme switch (buttons, `T`, `?theme=`) repaints the charts, and `aria-pressed` follows. Switching replays the full entrance (tiles plus chart reveals), but not under reduced motion.
- [ ] Performance: `bentoViz.stats()`. Proof: ≈ 3.5 ms/frame across all charts during the reveal, ≈ 1 ms/frame idle (hero only, 30 fps).
- [ ] File size: proof ≈ 105 KB raw / 65 KB gzip before export; ≈ 145 KB with export inlined. Flag anything over 1 MB without supplied art.

**Export (§13)**
- [ ] `node build/export.mjs <html> --formats=png-all,pdf,pptx,vector-pdf,screenshot` runs clean and prints "no console errors, no network requests".
- [ ] **Fidelity:** for each theme, diff the in-page PNG against the Chrome screenshot. Edge v3 measured a mean difference of 0.07 out of 255, with no pixel off by more than 32. A visible diff means a chart isn't drawing its settled state in `snapshot`, or the CSS doesn't survive `<foreignObject>` (gotcha 18).
- [ ] The exports contain no theme pill, Export menu or hover light, and no tile is caught mid-entrance.
- [ ] `.pptx` opens in python-pptx (3 slides, 12192000×6858000 EMU), and `soffice --headless --convert-to pdf` renders all three slides.
- [ ] After an in-page export, the slide stays on the user's theme and the intro does not replay.

---

## 12. Gotchas (learned the hard way)

1. **`devicePixelContentBoxSize` can lie under emulated DPR** (Puppeteer/DevTools device mode reports CSS px). Use it only when it agrees with `devicePixelRatio`; otherwise `round(css × dpr)`. The symptom is a soft slide at 2× that looks fine at 1×.
2. **Measure with ResizeObserver / `clientWidth`, not `getBoundingClientRect()`,** while tiles animate. The entrance `transform` changes the rect, not the layout box.
3. **Canvas text uses only already-loaded fonts.** An inline `@font-face` that no DOM text uses yet won't load. Call `document.fonts.load('500 12px BentoMono')` before the first paint, and repaint on `loadingdone`.
4. **CSS `filter: blur()` in the entrance** blurs canvases mid-reveal and makes QA captures soft. Use opacity + translate only.
5. **Odd-width lines need half-pixel offsets** at the *device* scale: `snap()` handles it for both 1× and 2×. Diagonal ticks aren't snappable, so keep them ≥ 1 CSS px.
6. **Glow with `lighter` on light backgrounds washes out to white.** Use `source-over` (a tint) on Light and `lighter` on Dark only.
7. **Hover wedges must hug the data.** A wedge out to the max radius reads as a gray block. Clip it to that hour's outermost dot plus one pitch, with a radial fade.
8. **Labels near dial poles collide.** The hero caption first sat top-right and touched the anomaly label. Captions go where the chart is empty, and the anomaly label is placed at the cluster's tip, aligned away from the center.
9. **KPI/tooltip disagreement is easy to ship.** The proof's first pass showed "41% open rate" next to a tooltip saying "37%". Derive both from the same parameters.
10. **The CSS stagger and the JS reveal share a timeline** (`performance.now()` from navigation). If the runtime initializes late (slow fonts), charts start mid-reveal instead of waiting, which is acceptable. Don't delay the whole slide for it.
11. **Headless QA** needs no GPU flags any more. Wait ≈ 4 s for the reveal; `bentoViz.settle()` jumps to the final state.
12. **Defaulting is the failure mode.** Edge AI v1 copied L5 + radial hero + histogram + dial + column-dots from the proof because the proof was the only worked example. The designer read it as a clone. Run §6.4 *before* writing markup, not after QA.
13. **Retarget `shoot.mjs` per layout.** Its hover points and zoom crops are pixel coordinates; after a layout change they land on gutters. Point them at the hero chart and at the densest secondary tiles.
14. **Strip tiles (2 rows tall) leave ~11cqw of height for copy.** Keep the title ≤ 2 lines at `--fs-title-strip` (1.45cqw), the body ≤ 2 lines, and pin the KPI to the copy column's foot. A third title line pushes the KPI out of the tile.
15. **Sampled data must reproduce the stated statistic exactly.** `frame-stems` shifts its seeded sample so the median *is* `data-median`. Check it in the console (`bentoViz.recipes[…].layout`), not by eye.
16. **Export capture must not use the live canvases.** They're sized to the presenter's window (often 1280 px wide at 1×), so upscaling them gives soft 4K PNGs. `bentoViz.snapshot(scale, 1920)` redraws every recipe, settled and un-hovered, into new canvases at export size. New recipes get this for free *if* `draw()` depends only on `c` and `{ p, t, f }`, and not on module state or `performance.now()`.
17. **Theme round-trips during export must be frame-free.** Set the theme, snapshot, clone the DOM, and restore the theme in one synchronous block. The browser can't paint in between, so nothing flickers. Set `data-exporting` so the theme observer doesn't replay the entrance when it sees the round-trip.
18. **`<foreignObject>` capture rules:** inside an SVG image, `:root` is the `<svg>`, so the exporter rewrites `:root {` to `:root, .bx-root {`. Fonts must be data URLs, which they are after `build.mjs`; in the dev shell, exports fall back to system fonts. External images, `backdrop-filter` and `mix-blend-mode` on the stage don't survive the capture, so keep them outside `.stage` or accept the loss. Animations are forced off, so every element must look right in its final, un-animated state.
19. **Chrome prints without backgrounds unless told otherwise.** The shell's print block sets `print-color-adjust: exact` on every element. Without it, a dark slide saved as PDF comes out as white tiles with grey text.

---

## 13. Export (standard capability)

Every slide built with this skill ships with `export/bento-export.js` inlined. The designer gets an **Export** button in the bottom pill (or presses `E`). The button is hidden with `?ui=0` and never appears in an export. Everything runs offline in the tab: PNG through canvas, ZIP, PDF and PPTX encoded by hand. There are no libraries, workers or network calls.

| Menu item | File | What it is | Best for |
|---|---|---|---|
| PNG · this theme | `<slug>-<theme>@2x.png` | 3840×2160 at the default 2× (`?scale=3` gives 5760×3240). The settled final frame with no UI. | Slack, docs, or dropping one slide into any deck |
| PNG · all 3 themes | `<slug>-themes@2x.zip` | Light, Dark, and Keynote in the current tone | Handing a designer every variant |
| PDF · all 3 themes | `<slug>-themes.pdf` | 3 pages at 1920×1080 pt, each a JPEG at q.95 / 2×. **The page size equals Keynote's default slide size**, so a page placed in Keynote fills the slide at 100%. | Review and sign-off, or placing in Keynote |
| Keynote / PowerPoint | `<slug>-keynote.pptx` | A 3-slide 16:9 deck with one full-bleed 2× PNG per theme. The slide copy is in each picture's alt text. | **In Keynote, File → Open (or drop the file on the Keynote icon) gives a real Keynote deck.** Double-clicking opens whatever app owns `.pptx`, often PowerPoint. It also works in PowerPoint and Google Slides. |
| Print / vector PDF… | the browser's dialog | Choose "Save as PDF". The page is 1920×1080 px; text stays **vector** with Inter embedded; charts are swapped for 2× snapshots during the print. | A PDF with selectable, sharp text |

**CLI (batch, CI, or "send me all the files"):** `node build/export.mjs <html> --out=<dir> --formats=png-all,pdf,pptx,vector-pdf [--scale=2]`. It drives headless Chrome over CDP and needs no npm installs. It produces the same in-page formats, plus `vector-pdf`: Chrome's `printToPDF`, one file per theme with vector text and the charts at 2×. Set `CHROME=` if Chrome isn't in a standard location.

**Why there's no `.key`:** Keynote's format is an undocumented bundle of IWA (snappy-compressed protobuf) files with no public spec. A browser-built `.key` would be guesswork that can break with any Keynote update, so the skill doesn't fake one. Keynote opens `.pptx` natively, which is the reliable path. If a native `.key` is required, open the `.pptx` in Keynote and use File → Save; that takes ten seconds and Keynote writes the file itself.

**Honest limits (tell the user):**
- In the `.pptx` and PDF, **each slide is one image**. Text isn't editable in Keynote. For editable copy, the designer retypes it over the image; the copy is in the alt text. The vector-PDF path keeps text vector but is still one placed object in Keynote.
- **Exports are static.** They capture the settled final frame. The reveal animation, hover readouts and theme switching only exist in the HTML. To present with motion, present the HTML fullscreen in a browser.
- The in-page capture uses SVG `<foreignObject>`. It's verified in Chrome; Safari and Firefox are supported by spec but not tested in this repo. If the browser blocks the capture, the menu says so and points to Print and the CLI.
- Light, Dark and Keynote are all captured in the **current** Keynote tone (`data-tone`).

**Adding a format** is one entry in `KINDS` in `bento-export.js` (`label`, `ext()`, `run(step) → Blob`), plus a menu row. Reuse `capture()`, `zip()`, `pdf()` and `pptx()`.

**Porting to a slide with a forked runtime:** copy the `snapshot` block from `viz/bento-viz.js` into its `window.bentoViz`. It relies only on the shared `Chart` and `palette()` contract (TECH-NOTES "Export").

