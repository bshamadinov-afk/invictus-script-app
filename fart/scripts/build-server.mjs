// Bundles the multiplayer server into dist/server.mjs (ws stays an npm dependency).
import { build } from 'esbuild';

await build({
  entryPoints: ['server/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outfile: 'dist/server.mjs',
  logLevel: 'warning',
});
console.log('dist/server.mjs written');
