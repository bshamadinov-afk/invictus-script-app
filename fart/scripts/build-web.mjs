// Bundles the engine and inlines it into web/game.template.html → web/index.html (one self-contained file).
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'FART',
  target: ['es2020', 'safari15'],
  minify: true,
  write: false,
});
const engine = result.outputFiles[0].text;
const body = readFileSync('web/game.template.html', 'utf8').replace('/*ENGINE*/', () => engine);
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>
</head>
<body>
${body}
</body>
</html>
`;
writeFileSync('web/index.html', html);
console.log(`web/index.html written (${(html.length / 1024).toFixed(1)} KB)`);
