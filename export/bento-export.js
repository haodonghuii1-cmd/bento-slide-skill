/* bento-export.js — in-page, offline export for bento slides (bento-rerun/SKILL.md §13, TECH-NOTES "Export").
   Drop-in: load it after the viz runtime. It adds an Export menu to the `.theme-switch` pill (or its own pill) and exposes
   window.bentoExport. Nothing leaves the tab: every file is encoded here (PNG via canvas, ZIP/PDF/PPTX by hand).

   Formats
     png      the current theme, 1920×1080 CSS px at `scale` (default max(2, DPR), cap 3) → 3840×2160 at 2×
     png-all  one PNG per theme (Light, Dark, Keynote in the current tone) in a .zip
     pdf      one 16:9 page per theme (1920×1080 pt pages, JPEG q.95 images): place in Keynote or any deck tool
     pptx     one full-bleed 16:9 slide per theme (PNG). Keynote, PowerPoint and Google Slides open it as a deck.
     print    the browser's print dialog → "Save as PDF": vector text, charts swapped for 2× snapshots
   How capture works
     1. Synchronously, per theme: set data-theme, ask the viz runtime for settled 2× chart canvases (bentoViz.snapshot),
        and clone the stage with each live canvas replaced by an <img> of its snapshot. Then restore the theme.
        No frame is painted in between, so the screen never flickers and the intro does not replay.
     2. Each clone is serialized with the page's own CSS into an SVG <foreignObject> at 1920×1080 and drawn onto a
        canvas at `scale`. UI outside .stage (theme switch, this menu) is never in the clone; inside the stage,
        anything marked data-export="hide" is dropped. Animations and hover light are forced to their final state.
   Console: bentoExport.download('png'|'png-all'|'pdf'|'pptx'), bentoExport.blob(kind) → Promise<Blob>, bentoExport.print().
   URL: ?export=<kind> runs one export after load (used by build/export.mjs); ?scale=1..3 overrides the scale. */
(() => {
  'use strict';
  const root = document.documentElement;
  const stage = document.querySelector('.stage');
  if (!stage) return;
  const q = new URLSearchParams(location.search);
  const W = 1920, H = 1080;
  const SCALE = Math.min(3, Math.max(1, +q.get('scale') || Math.max(2, Math.round(devicePixelRatio || 1))));
  const SLUG = document.querySelector('meta[name="bento-slug"]')?.content
    || document.title.split(/[—–|]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'slide';
  const themeList = () => [['light'], ['dark'], ['keynote', root.dataset.tone || 'dark']];
  const themeName = (t, tone) => (t === 'keynote' ? `keynote-${tone || 'dark'}` : t);
  const enc = new TextEncoder();

  /* ---------- capture ---------- */
  const EXPORT_CSS = `
.bx-root { width: ${W}px; height: ${H}px; margin: 0; overflow: hidden; font-family: var(--font); font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.bx-root .stage { width: ${W}px !important; }
.bx-root *, .bx-root *::before, .bx-root *::after { animation: none !important; transition: none !important; }
.bx-root .tile { translate: none !important; transform: none !important; opacity: 1 !important; }
.bx-root .tile::after, .bx-root [data-export="hide"] { display: none !important; }`;
  // The page's CSS, with :root tokens also applied to the export wrapper (inside an SVG image :root is the <svg>).
  const pageCSS = () => [...document.querySelectorAll('style:not([data-bx-ui])')].map((s) => s.textContent).join('\n')
    .replace(/:root\s*\{/g, ':root, .bx-root {');

  function freeze(theme, tone, scale) {
    if (theme) root.dataset.theme = theme;
    if (tone) root.dataset.tone = tone;
    const snaps = window.bentoViz?.snapshot?.(scale, W) || new Map();
    const clone = stage.cloneNode(true);
    const src = [...stage.querySelectorAll('.viz[data-chart]')], dst = [...clone.querySelectorAll('.viz[data-chart]')];
    src.forEach((el, i) => {
      const cv = snaps.get(el), old = dst[i]?.querySelector('canvas');
      if (!cv || !old) return;
      const img = document.createElement('img');
      img.className = old.className; img.alt = ''; img.src = cv.toDataURL('image/png');
      old.replaceWith(img);
    });
    clone.querySelectorAll('[data-export="hide"]').forEach((e) => e.remove());
    clone.querySelectorAll('.is-lit').forEach((e) => e.classList.remove('is-lit'));
    return { theme: root.dataset.theme, tone: root.dataset.tone, clone };
  }

  async function raster({ theme, tone, clone }, scale, css) {
    const wrap = document.createElement('div');
    wrap.className = 'bx-root'; wrap.dataset.theme = theme; wrap.dataset.tone = tone;
    const st = document.createElement('style'); st.textContent = css;
    wrap.append(st, clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">`
      + `<foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));   // Safari: let nested images settle first
    const cv = document.createElement('canvas');
    cv.width = W * scale; cv.height = H * scale;
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  // themes: [[theme, tone], …] or null for the current theme. Resolves to [{ name, canvas }].
  async function capture(themes, scale = SCALE, onStep) {
    await document.fonts?.ready;
    const keep = { theme: root.dataset.theme, tone: root.dataset.tone };
    root.dataset.exporting = '';          // the theme script skips its entrance replay while this is set
    let frozen;
    try { frozen = (themes || [[null]]).map(([t, tone]) => freeze(t, tone, scale)); }
    finally { root.dataset.theme = keep.theme; root.dataset.tone = keep.tone; setTimeout(() => delete root.dataset.exporting, 0); }
    const css = pageCSS() + EXPORT_CSS, out = [];
    for (const f of frozen) {
      const name = themeName(f.theme, f.tone);
      onStep?.(`Rendering ${name}…`);
      out.push({ name, canvas: await raster(f, scale, css) });
    }
    return out;
  }

  /* ---------- encoders ---------- */
  const toBytes = (cv, type, quality) => new Promise((res, rej) => cv.toBlob(
    (b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('canvas.toBlob failed'))), type, quality));
  const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = ~0; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
  // ZIP, STORE only (PNG/JPEG are already compressed; OOXML accepts stored parts). files: [{ name, data: Uint8Array|string }]
  function zip(files, type = 'application/zip') {
    const parts = [], central = [], d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data), n = data.length;
      const lh = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20], [6, 0x0800], [8, 0], [10, time], [12, date], [14, crc, 4], [18, n, 4], [22, n, 4], [26, name.length], [28, 0]]
        .forEach(([o, v, s]) => (s === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
      const ch = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20], [6, 20], [8, 0x0800], [10, 0], [12, time], [14, date], [16, crc, 4], [20, n, 4], [24, n, 4], [28, name.length], [42, off, 4]]
        .forEach(([o, v, s]) => (s === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
      parts.push(lh, name, data); central.push(ch, name);
      off += 30 + name.length + n;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end], { type });
  }

  // PDF 1.4, one page per image, page = W×H pt (Keynote's default 1920×1080 slide, so a page drops in at 100%).
  function pdf(pages, title) {
    const chunks = [], offs = [];
    let len = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); len += u.length; };
    const obj = (n, ...body) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
    push('%PDF-1.4\n%âãÏÓ\n');
    const N = pages.length, info = 3 + N * 3;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${N} >>`);
    pages.forEach((pg, i) => {
      const p = 3 + i * 3, cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
      obj(p + 1, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
      obj(p + 2, `<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`, pg.jpeg, '\nendstream');
    });
    obj(info, `<< /Title (${title.replace(/[^\x20-\x7e]/g, '-').replace(/[()\\]/g, '\\$&')}) /Producer (bento-export) >>`);
    const xref = len;
    push(`xref\n0 ${info + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= info; n++) push(`${String(offs[n]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  // Minimal PresentationML: 16:9 (13.333 × 7.5 in), one blank layout, one full-bleed picture per slide, alt text = slide copy.
  function pptx(slides, title) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', CT = 'application/vnd.openxmlformats-officedocument.';
    const rels = (l) => `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${l.map(([id, t, to]) => `<Relationship Id="${id}" Type="${t.includes('://') ? t : OD + t}" Target="${to}"/>`).join('')}</Relationships>`;
    const CX = 12192000, CY = 6858000;
    const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const clr = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
    const three = (s) => s + s + s;
    const theme = `${X}<a:theme ${NS.split(' ')[0]} name="Bento"><a:themeElements><a:clrScheme name="Bento">${clr('dk1', '000000')}${clr('lt1', 'FFFFFF')}${clr('dk2', '161618')}${clr('lt2', 'F5F5F7')}`
      + `${clr('accent1', 'FF5A4D')}${clr('accent2', '2997FF')}${clr('accent3', '8B8B91')}${clr('accent4', 'CF3D2F')}${clr('accent5', '0071E3')}${clr('accent6', '6C6C71')}${clr('hlink', '2997FF')}${clr('folHlink', '8B8B91')}</a:clrScheme>`
      + '<a:fontScheme name="Bento"><a:majorFont><a:latin typeface="Helvetica Neue"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Helvetica Neue"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
      + `<a:fmtScheme name="Bento"><a:fillStyleLst>${three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:fillStyleLst><a:lnStyleLst>${three('<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>')}</a:lnStyleLst>`
      + `<a:effectStyleLst>${three('<a:effectStyle><a:effectLst/></a:effectStyle>')}</a:effectStyleLst><a:bgFillStyleLst>${three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
    const files = [
      { name: '[Content_Types].xml', data: `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/>`
        + `<Override PartName="/ppt/presentation.xml" ContentType="${CT}presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${CT}theme+xml"/>`
        + `${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]) },
      { name: 'docProps/core.xml', data: `${X}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>bento-export</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
      { name: 'ppt/presentation.xml', data: `${X}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${CX}" cy="${CY}"/><p:notesSz cx="${CY}" cy="${CX}"/></p:presentation>` },
      { name: 'ppt/_rels/presentation.xml.rels', data: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]) },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: `${X}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${grp}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: `${X}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
      { name: 'ppt/theme/theme1.xml', data: theme },
    ];
    slides.forEach((s, i) => {
      const n = i + 1;
      files.push(
        { name: `ppt/slides/slide${n}.xml`, data: `${X}<p:sld ${NS}><p:cSld name="${xmlEsc(s.name)}"><p:spTree>${grp}<p:pic><p:nvPicPr><p:cNvPr id="2" name="${xmlEsc(`${SLUG} · ${s.name}`)}" descr="${xmlEsc(s.alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
          + `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${CX}" cy="${CY}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>` },
        { name: `ppt/slides/_rels/slide${n}.xml.rels`, data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/slide${n}.png`]]) },
        { name: `ppt/media/slide${n}.png`, data: s.png },
      );
    });
    return zip(files, `${CT}presentationml.presentation`);
  }

  // The slide's copy as plain text: alt text for each picture so the deck stays searchable and accessible.
  const altText = () => [stage.getAttribute('aria-label'), ...[...stage.querySelectorAll('.title, .num')].map((e) => e.textContent.replace(/\s+/g, ' ').trim())]
    .filter(Boolean).join(' · ');

  /* ---------- formats ---------- */
  const KINDS = {
    png: { label: 'PNG · this theme', ext: () => `${themeName(root.dataset.theme, root.dataset.tone)}@${SCALE}x.png`,
      async run(step) { const [s] = await capture(null, SCALE, step); return new Blob([await toBytes(s.canvas, 'image/png')], { type: 'image/png' }); } },
    'png-all': { label: 'PNG · all themes (.zip)', ext: () => `themes@${SCALE}x.zip`,
      async run(step) {
        const shots = await capture(themeList(), SCALE, step), files = [];
        for (const s of shots) { step(`Encoding ${s.name}…`); files.push({ name: `${SLUG}-${s.name}@${SCALE}x.png`, data: await toBytes(s.canvas, 'image/png') }); }
        return zip(files);
      } },
    pdf: { label: 'PDF · all themes, 16:9', ext: () => 'themes.pdf',
      async run(step) {
        const shots = await capture(themeList(), SCALE, step), pages = [];
        for (const s of shots) { step(`Encoding ${s.name}…`); pages.push({ jpeg: await toBytes(s.canvas, 'image/jpeg', 0.95), w: s.canvas.width, h: s.canvas.height }); }
        return pdf(pages, document.title);
      } },
    pptx: { label: 'Keynote / PowerPoint (.pptx)', ext: () => 'keynote.pptx',
      async run(step) {
        const shots = await capture(themeList(), SCALE, step), slides = [], alt = altText();
        for (const s of shots) { step(`Encoding ${s.name}…`); slides.push({ name: s.name, alt, png: await toBytes(s.canvas, 'image/png') }); }
        return pptx(slides, document.title);
      } },
  };

  let busy = false;
  async function blob(kind = 'png', step = () => {}) {
    const k = KINDS[kind];
    if (!k) throw new Error(`bento-export: unknown format "${kind}" (${Object.keys(KINDS).join(', ')})`);
    return k.run(step);
  }
  const filename = (kind) => `${SLUG}-${KINDS[kind].ext()}`;
  function save(b, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; a.hidden = true;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
  }
  async function download(kind = 'png') {
    if (busy) return;
    busy = true; ui?.setBusy(true);
    try {
      const b = await blob(kind, (m) => ui?.status(m));
      const name = filename(kind);
      save(b, name);
      ui?.status(`Saved ${name} · ${(b.size / 1048576).toFixed(1)} MB`, 4000);
      return name;
    } catch (e) {
      console.error(e);
      ui?.status(`Export failed in this browser (${e.name || 'error'}). Try Print → Save as PDF, or Chrome.`, 8000);
    } finally { busy = false; ui?.setBusy(false); }
  }

  /* ---------- print: swap live canvases for 2× snapshots so a "Save as PDF" is sharp ---------- */
  const printImgs = [];
  addEventListener('beforeprint', () => {
    window.bentoViz?.snapshot?.(2, W).forEach((cv, el) => {
      const img = document.createElement('img');
      img.className = 'viz__cv bx-print'; img.alt = ''; img.src = cv.toDataURL('image/png');
      el.append(img); printImgs.push(img);
    });
  });
  addEventListener('afterprint', () => { printImgs.splice(0).forEach((i) => i.remove()); });

  /* ---------- UI: an Export button in the theme pill + a small menu (UI only; never captured) ---------- */
  let ui = null;
  function buildUI() {
    const style = document.createElement('style');
    style.dataset.bxUi = '';
    style.textContent = `
.bx-pill { position: fixed; left: 50%; bottom: 10px; translate: -50% 0; z-index: 20; display: flex; gap: 2px; padding: 3px; border-radius: 999px;
  background: rgba(28,28,32,.62); backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 0 0 1px rgba(255,255,255,.1) inset, 0 6px 20px -8px rgba(0,0,0,.45); font: 500 12px/1 var(--font, system-ui); }
.bx-sep { width: 1px; margin: 5px 3px; background: rgba(255,255,255,.16); }
.bx-btn { appearance: none; border: 0; margin: 0; padding: 7px 13px; border-radius: 999px; cursor: pointer; font: inherit; color: rgba(255,255,255,.75); background: transparent; }
.bx-btn:hover, .bx-btn[aria-expanded="true"] { color: #fff; background: rgba(255,255,255,.1); }
.bx-btn:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.bx-menu { position: fixed; left: 50%; bottom: 52px; translate: -50% 0; z-index: 21; min-width: 280px; padding: 6px; border-radius: 14px;
  background: rgba(28,28,32,.86); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: 0 0 0 1px rgba(255,255,255,.1) inset, 0 16px 40px -12px rgba(0,0,0,.6); font: 500 12px/1.3 var(--font, system-ui); color: #fff; }
.bx-menu[hidden] { display: none; }
.bx-menu button { display: flex; width: 100%; justify-content: space-between; gap: 16px; appearance: none; border: 0; margin: 0; padding: 9px 10px; border-radius: 8px;
  font: inherit; color: rgba(255,255,255,.9); background: transparent; cursor: pointer; text-align: left; }
.bx-menu button:hover, .bx-menu button:focus-visible { background: rgba(255,255,255,.1); outline: none; }
.bx-menu button:disabled { opacity: .4; cursor: progress; }
.bx-menu small { color: rgba(255,255,255,.5); font: 500 11px/1.3 var(--mono, ui-monospace, monospace); white-space: nowrap; }
.bx-menu p { margin: 6px 10px 4px; color: rgba(255,255,255,.5); font-size: 11px; }
.bx-status { position: fixed; left: 50%; bottom: 52px; translate: -50% 0; z-index: 22; padding: 8px 12px; border-radius: 999px; background: rgba(28,28,32,.86);
  color: #fff; font: 500 12px/1 var(--font, system-ui); box-shadow: 0 0 0 1px rgba(255,255,255,.1) inset; pointer-events: none; }
.bx-status[hidden] { display: none; }
.no-ui .bx-pill, .no-ui .bx-menu, .no-ui .bx-status { display: none !important; }
@media print { .bx-pill, .bx-menu, .bx-status { display: none !important; } .viz:has(.bx-print) > canvas { display: none; } }`;
    document.head.append(style);

    let pill = document.querySelector('.theme-switch');
    if (!pill) { pill = document.createElement('nav'); pill.className = 'bx-pill'; pill.setAttribute('aria-label', 'Export'); document.body.append(pill); }
    else { const sep = document.createElement('span'); sep.className = 'bx-sep'; sep.setAttribute('aria-hidden', 'true'); pill.append(sep); }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'bx-btn'; btn.textContent = 'Export';
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.title = 'Export (E)';
    pill.append(btn);

    const px = `${W * SCALE}×${H * SCALE}`;
    const menu = document.createElement('div');
    menu.className = 'bx-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    const items = [
      ['png', 'PNG · this theme', px],
      ['png-all', 'PNG · all 3 themes', '.zip'],
      ['pdf', 'PDF · all 3 themes', '16:9 pages'],
      ['pptx', 'Keynote / PowerPoint', '.pptx · 3 slides'],
      ['print', 'Print / vector PDF…', /Mac|iP/.test(navigator.platform) ? '⌘P' : 'Ctrl+P'],
    ];
    menu.innerHTML = items.map(([k, l, s]) => `<button type="button" role="menuitem" data-kind="${k}"><span>${l}</span><small>${s}</small></button>`).join('')
      + '<p>Made offline in this tab. The .pptx opens in Keynote as a 3-slide 16:9 deck (one image per theme).</p>';
    document.body.append(menu);
    const status = document.createElement('div');
    status.className = 'bx-status'; status.setAttribute('role', 'status'); status.hidden = true;
    document.body.append(status);

    const open = (v) => { menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); if (v) { status.hidden = true; menu.querySelector('button')?.focus(); } };
    btn.addEventListener('click', () => open(menu.hidden));
    menu.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kind]')?.dataset.kind;
      if (!k) return;
      open(false);
      if (k === 'print') print(); else download(k);
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
      if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey && !root.classList.contains('no-ui')) open(menu.hidden);
    });
    addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) open(false); });
    let tmr = 0;
    return {
      status(msg, ms) { clearTimeout(tmr); status.textContent = msg; status.hidden = false; if (ms) tmr = setTimeout(() => { status.hidden = true; }, ms); },
      setBusy(v) { menu.querySelectorAll('button').forEach((b) => { b.disabled = v; }); btn.textContent = v ? 'Exporting…' : 'Export'; },
    };
  }
  ui = buildUI();

  window.bentoExport = { download, blob, filename, print: () => print(), capture, formats: Object.keys(KINDS), scale: SCALE };
  const auto = q.get('export');
  if (auto) addEventListener('load', () => setTimeout(() => download(auto), 300));
})();
