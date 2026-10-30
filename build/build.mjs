// Inline fonts + scripts into the shell → ONE offline HTML file (bento-rerun/SKILL.md §5 step 7).
//   node build.mjs [shell=../bento-shell.html] [out=../dist/bento-slide.html]   (edge-ai-bento: node build.mjs ../edge-shell.html ../edge-ai-bento.html)
// Fails if any external reference (src=, href=, url(), @import) survives, so the output can't make a network request.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [shellArg = '../bento-shell.html', outArg = '../dist/bento-slide.html'] = process.argv.slice(2);
const shell = resolve(here, shellArg), base = dirname(shell), out = resolve(here, outArg);
let html = readFileSync(shell, 'utf8');

html = html.replace(/url\((fonts\/[\w.-]+\.woff2?)\)/g, (_, f) =>
  `url(data:font/${f.endsWith('2') ? 'woff2' : 'woff'};base64,${readFileSync(resolve(base, f)).toString('base64')})`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) =>
  `<script>\n${readFileSync(resolve(base, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);

const leaks = [...html.matchAll(/\b(?:src|href)="(?!#|data:)[^"]+"|url\((?!data:|#)[^)]*\)|@import/g)].map((m) => m[0]);
if (leaks.length) { console.error('external references left:', leaks); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB`);
