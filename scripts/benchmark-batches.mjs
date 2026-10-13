// Build first. Creates and removes a synthetic VMF under stateDir; never compiles it.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';
import { assertWritable } from '../dist/fs/guard.js';
import { writeGuarded } from '../dist/fs/write.js';
import { emptyVmf } from '../dist/vmf/skeleton.js';
import { writeVmfSolidTool } from '../dist/tools/build.js';
import { editVmf } from '../dist/tools/vmfedit.js';
const config = loadConfig(process.env.HAMMER_MCP_REPO ?? process.cwd());
mkdirSync(assertWritable(config.stateDir, config), {recursive:true});
const scratch = mkdtempSync(join(config.stateDir, 'batch-benchmark-'));
const path = join(scratch, 'scene.vmf');
const records = [];
const ctx = {config, audit:{record:entry=>records.push(entry)}};
try {
  writeGuarded(path, emptyVmf(), config);
  const start = performance.now();
  const brushes = writeVmfSolidTool.handler({path,solids:Array.from({length:24},(_,i)=>({
    shape:'box',mins:[i*128,0,0],maxs:[i*128+64,64,64],
  })),backup:true,confirm:true},ctx);
  const brushMs = performance.now()-start;
  const entityStart = performance.now();
  const entities = editVmf.handler({path,ops:Array.from({length:12},(_,i)=>({op:'add',
    keyvalues:{classname:i===0?'info_player_start':i===1?'info_director':'info_target',origin:`${i*128} 128 32`},
  })),backup:true,confirm:true},ctx);
  console.log(JSON.stringify({brushMs,entityMs:performance.now()-entityStart,
    createdBrushes:brushes.verified.length,createdEntities:entities.entitiesAfter,
    writtenBatches:records.filter(entry=>entry.data.written).length,records},null,2));
} finally { rmSync(scratch,{recursive:true,force:true}); }
