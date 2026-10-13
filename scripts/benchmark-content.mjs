// Build first. Usage: node scripts/benchmark-content.mjs [pattern]
// Each search is a fresh Python process; only the disposable disk index is shared.
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../dist/config.js';
import { pythonPath, callSidecar } from '../dist/sidecar/client.js';
import { readGameContentTool } from '../dist/tools/content.js';
const config = loadConfig(process.env.HAMMER_MCP_REPO ?? process.cwd());
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  const result = spawnSync(pythonPath(config), ['-c', 'pass']);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  console.log(JSON.stringify({ pythonLaunchMs: performance.now() - start }));
}
const ctx = { config, audit: { record: () => undefined } };
for (const options of [{rebuildIndex:true}, {}, {}, {details:true}, {offset:100}]) {
  const started = performance.now();
  const result = await readGameContentTool.handler({ pattern:process.argv[2] ?? '*', kind:'material',
    limit:100, offset:0, ...options }, ctx);
  console.log(JSON.stringify({ options, durationMs:performance.now()-started,
    total:result.total, shown:result.shown, cache:result.cache, timings:result.timings }));
}
const warnings = [];
const onWarning = warning => warnings.push(warning.name + ': ' + warning.message);
process.on('warning', onWarning);
const before = Object.fromEntries(process.eventNames().map(name => [String(name),process.listenerCount(name)]));
for (let wave=0; wave<3; wave++) {
  await Promise.all(Array.from({length:12},()=>callSidecar('health',{},config)));
}
await new Promise(resolve=>setImmediate(resolve));
const after = Object.fromEntries(process.eventNames().map(name => [String(name),process.listenerCount(name)]));
process.removeListener('warning', onWarning);
console.log(JSON.stringify({ listenerProbe:{calls:36,before,after,warnings} }));
