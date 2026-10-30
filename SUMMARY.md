# Summary: data-viz art direction

You switched the Light/Dark tile art from 3D studio objects to the language of `dataviz-ref.jpg`. That means dense, precise data visualization on calm surfaces with one accent. I rewrote the skill, swapped the rendering stack, rebuilt the proof, and reshot QA.

## What's new

- **`SKILL.md`** is rewritten for the new direction. Keynote is unchanged.
  - **§7.1, the five rules:**
    1. composition restraint
    2. single accent
    3. sharpness/DPR
    4. subtle glow
    5. natural hover
  - **§7.2–7.3:** exact Dark and Light tokens: surfaces, an alpha ladder for marks, accent, and glow.
  - **§7.5, the recipe library:**
    - six working recipes: `radial-clock`, `dot-histogram`, `tick-gauge`, `dot-grid`, `dot-area`, `spark-bars`
    - seven more specced: share matrix, polar bars, beeswarm, and others
    - a **brief-to-recipe mapping table** and **honesty rules** for real vs. sample data
  - The data manifest step, the motion checklist, the QA checklist, and 11 gotchas from this pass are all updated to match.
- **`TECH-NOTES.md`** makes the stack call: **Canvas2D at exact device pixels for marks, and HTML for real text.** It includes an honest comparison with SVG, D3, WebGL, PNG, and Lottie, measured performance, and the limits.
- **`viz/bento-viz.js`** is the new runtime: ~18 KB minified, no dependencies.
- **`bento-shell.html`** and **`bento-proof.html`** are rebuilt as a 16:9 slide with on-screen Light / Dark / Keynote buttons. The proof is one offline file, ~105 KB (~65 KB gzip), with fonts inlined.
- **`qa/`** has new 2× captures: light, dark, keynote, reduced motion, hover, 1:1 zoom crops, and 1440/1280 frames.
- **The 3D-era files** (Three.js runtime, posters, old docs and QA) are moved to `_archive-3d/`. Nothing was deleted.

## The proof's tiles

| Tile | Recipe | Story |
|---|---|---|
| Hero | Radial dot clock (1 dot = 2,000 messages) | The sweep hand runs to 14:20; past hours are bright, the forecast is faint, and a coral SMS-retry burst at 02:14 has the slide's only glow. 99.98% sits at the center, with two KPI cards with sparkbars and a legend. |
| Latency | Dot histogram | p50/p95/p99 markers on a fine ticked axis |
| Throughput | Tick gauge | 121 ticks lit to 3× |
| Reliability | 90 × 24 dot calendar | One accent incident cell with a ring and a mono label |
| Insights | Nested dot area | Delivered ⊃ opened ⊃ clicked; the crosshair chip follows hover |

## Try it

- Open `bento-proof.html`. Use the buttons, `T`, or `?theme=light|dark|keynote`; `?ui=0` hides the switch.
- Hover the hero dial for per-hour readouts, and hover the bottom charts for chips.
- To rebuild: `cd build && node build.mjs && node shoot.mjs`.

## Verified

- In headless Chrome at DPR 2, every canvas renders at exactly 2× its CSS size. The 1:1 crops are sharp.
- The slide is exactly 16:9 at 1920, 1440, and 1280, with no scroll, no console errors, and no network requests.
- Reduced motion paints the final state. Theme switching repaints without rebuilding.

## Gaps

- **Real-GPU and Safari aren't tested.** Everything was measured in headless Chrome on Linux.
- **All numbers are sample data** for the placeholder product, Relay.
- **Without JavaScript, tiles show copy and KPIs but no marks.** There's no poster fallback any more.
- **Print/PDF rasterizes the charts at print DPR.** A true vector PDF would need an SVG export path, which isn't built.
