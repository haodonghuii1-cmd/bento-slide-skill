// Batch export from the command line with headless Chrome — same engine as the in-page Export menu, plus two
// Chrome-native outputs. No npm deps (Node ≥ 22: global WebSocket). Nothing is fetched; the page is opened from disk.
//   node export.mjs [html=../edge-ai-bento.html] [--out=../exports] [--formats=png-all,pdf,pptx,vector-pdf,screenshot] [--scale=2]
// Formats
//   png | png-all | pdf | pptx   in-page engine (export/bento-export.js), identical to the menu
//   vector-pdf                   Chrome's printToPDF, one 1920×1080 px page per theme: vector text, charts at 2× → slug-<theme>-vector.pdf
//   screenshot                   Chrome's own screenshot per theme at DPR = scale (QA reference for the in-page PNG)
// CHROME=/path/to/chrome overrides the browser.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const html = resolve(here, args.find((a) => !a.startsWith('--')) || '../dist/bento-slide.html');
const outDir = resolve(here, opt('out', '../exports'));
const formats = opt('formats', 'png-all,pdf,pptx,vector-pdf').split(',');
const scale = +opt('scale', 2);
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(existsSync);
if (!chrome) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(resolve(tmpdir(), 'bento-export-'));

const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((ok, no) => {
  let buf = ''; proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  setTimeout(() => no(new Error('Chrome did not start')), 15000);
});
const browser = new WebSocket(wsUrl);
await new Promise((r) => browser.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(), events = [];
browser.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const i = ++id; pending.set(i, { ok, no }); browser.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const errors = [];
await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: scale, mobile: false });
// Reduced motion: a theme switch repaints in its final state instead of replaying the intro (native screenshot/PDF capture the live DOM).
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const url = `${pathToFileURL(html).href}?ui=0&scale=${scale}`;
await cdp('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 2500));
await evaluate('document.fonts.ready.then(() => window.bentoViz?.settle())');
await new Promise((r) => setTimeout(r, 400));

const slug = await evaluate('document.querySelector(\'meta[name="bento-slug"]\')?.content || "slide"');
const save = (name, b64) => { const f = resolve(outDir, name); writeFileSync(f, Buffer.from(b64, 'base64')); console.log(`${f}  ${(Buffer.byteLength(b64, 'base64') / 1048576).toFixed(2)} MB`); };
const themes = [['light', 'dark'], ['dark', 'dark'], ['keynote', 'dark']];
const setTheme = (t, tone) => evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(t)}; document.documentElement.dataset.tone = ${JSON.stringify(tone)};
  new Promise((r) => requestAnimationFrame(() => { window.bentoViz?.settle(); setTimeout(r, 500); }))`);

for (const f of formats) {
  if (['png', 'png-all', 'pdf', 'pptx'].includes(f)) {
    const b64 = await evaluate(`bentoExport.blob(${JSON.stringify(f)}).then(async (b) => {
      const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); })`);
    save(await evaluate(`bentoExport.filename(${JSON.stringify(f)})`), b64);
  } else if (f === 'vector-pdf' || f === 'screenshot') {
    for (const [t, tone] of themes) {
      await setTheme(t, tone);
      const name = t === 'keynote' ? `keynote-${tone}` : t;
      if (f === 'screenshot') save(`${slug}-${name}@${scale}x-chrome.png`, (await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data);
      else save(`${slug}-${name}-vector.pdf`, (await cdp('Page.printToPDF', { paperWidth: 20, paperHeight: 11.25, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true })).data);
    }
    await setTheme('dark', 'dark');
  } else console.warn(`unknown format: ${f}`);
}
for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') errors.push(e.params.args.map((a) => a.value ?? a.description).join(' '));
  if (e.method === 'Network.requestWillBeSent' && !/^(file|data|blob):/.test(e.params.request.url)) errors.push(`network request: ${e.params.request.url}`);
}
console.log(errors.length ? `PROBLEMS:\n  ${errors.join('\n  ')}` : 'no console errors, no network requests');
browser.close(); proc.kill();
await new Promise((r) => proc.once('exit', r)); rmSync(profile, { recursive: true, force: true });
process.exit(errors.length ? 1 : 0);
