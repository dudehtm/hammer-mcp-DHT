import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyVmf } from "../src/vmf/skeleton.js";
import { readEntities } from "../src/vmf/edit.js";
import { checkVmfSolids } from "../src/vmf/solid.js";
import { writeVmfSolidTool } from "../src/tools/build.js";
import { editVmf } from "../src/tools/vmfedit.js";
import { ctx as sharedCtx } from "./support/env.js";
import type { ToolContext } from "../src/mcp/registry.js";

const corruption = vi.hoisted(() => ({ enabled: false }));
vi.mock("../src/vmf/splice.js", async (original) => {
  const module = await original<typeof import("../src/vmf/splice.js")>();
  return { ...module, applySplices: (...args: Parameters<typeof module.applySplices>) =>
    module.applySplices(...args) + (corruption.enabled ? "\n}" : "") };
});
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync), copyFileSync: vi.fn(fs.copyFileSync) };
});
const scratch = mkdtempSync(join(tmpdir(), "hammer-batch-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
beforeEach(() => { corruption.enabled = false; });
const ctx = sharedCtx as unknown as ToolContext;
const box = { shape: "box", mins: [0, 0, 0], maxs: [64, 64, 64] };
function fixture(name: string) {
  const path = join(scratch, name + ".vmf");
  const before = emptyVmf() + 'entity\n{\n"id" "2"\n"classname" "info_target"\n}\n';
  writeFileSync(path, before);
  vi.mocked(writeFileSync).mockClear(); vi.mocked(copyFileSync).mockClear();
  return { path, before, mtime: statSync(path).mtimeMs };
}
function intact(f: ReturnType<typeof fixture>) {
  expect(readFileSync(f.path, "utf8")).toBe(f.before);
  expect(statSync(f.path).mtimeMs).toBe(f.mtime);
  expect(existsSync(f.path + ".bak")).toBe(false);
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(copyFileSync).not.toHaveBeenCalled();
}

describe("validated VMF batches", () => {
  it("writes multiple brushes once and backs up the complete original once", async () => {
    const f = fixture("brushes");
    await writeVmfSolidTool.handler({ path: f.path, solids: [box, { ...box, mins:[128,0,0], maxs:[192,64,64] }], backup:true } as never, ctx);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(copyFileSync).toHaveBeenCalledTimes(1);
    expect(readFileSync(f.path + ".bak", "utf8")).toBe(f.before);
    const report = checkVmfSolids(f.path, readFileSync(f.path, "utf8"));
    expect(report.solids.map(s => s.volume)).toEqual([64 ** 3, 64 ** 3]);
  });
  it("rejects a bad brush at the end without a backup, write or mtime change", async () => {
    const f = fixture("bad-brush");
    expect(() => writeVmfSolidTool.handler({ path:f.path, solids:[box, { ...box, maxs:[0,64,64] }], backup:true } as never,ctx)).toThrow();
    intact(f);
  });
  it("rejects material injection even when it forms syntactically valid KeyValues", async () => {
    const f = fixture("material");
    expect(() => writeVmfSolidTool.handler({ path:f.path, solids:[box], material:'X" "injected" "value', backup:true } as never,ctx)).toThrow(/quote/);
    intact(f);
  });
  it("writes entities and outputs in one batch with one original backup", async () => {
    const f = fixture("entities");
    await editVmf.handler({ path:f.path, ops:[
      { op:"add", keyvalues:{ classname:"info_director" } },
      { op:"update", match:{ id:2 }, set:{ targetname:"marker" } },
      { op:"addOutput", match:{ id:2 }, output:"OnUser1", value:"marker,FireUser2,,0,-1" },
    ], backup:true } as never,ctx);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(copyFileSync).toHaveBeenCalledTimes(1);
    expect(readFileSync(f.path + ".bak", "utf8")).toBe(f.before);
    const text = readFileSync(f.path, "utf8");
    expect(readEntities(text).entities.map(e=>e.classname)).toEqual(["info_target","info_director"]);
    expect(text).toContain('"OnUser1" "marker,FireUser2,,0,-1"');
  });
  it("rejects a bad entity at the end before touching the source", async () => {
    const f = fixture("bad-entity");
    expect(() => editVmf.handler({ path:f.path, ops:[{ op:"add", keyvalues:{ classname:"info_director" } },
      { op:"add", keyvalues:{ classname:'bad"name' } }],backup:true } as never,ctx)).toThrow();
    intact(f);
  });
  it("rejects edits inside an entity removed by the same batch", async () => {
    const f = fixture("conflict");
    expect(() => editVmf.handler({ path:f.path, ops:[{ op:"remove", match:{id:2} },
      { op:"update", match:{id:2},set:{ targetname:"lost" } }],backup:true } as never,ctx)).toThrow(/conflicting operations/);
    intact(f);
  });
  it("checks the complete generated document before writing", async () => {
    const f = fixture("formatter-defect");
    corruption.enabled = true;
    expect(() => editVmf.handler({ path:f.path, ops:[{ op:"update",match:{id:2},set:{targetname:"changed"} }],backup:true } as never,ctx)).toThrow(/unmatched/);
    intact(f);
  });
  it("rejects competing updates to a key absent from the original", async () => {
    const f = fixture("new-key-conflict");
    expect(() => editVmf.handler({ path:f.path,ops:[
      { op:"update",match:{id:2},set:{targetname:"first"} },
      { op:"update",match:{id:2},set:{targetname:"second"} },
    ],backup:true } as never,ctx)).toThrow(/conflicting updates/);
    intact(f);
  });
  it("verifies both batch writers on dryRun without touching the source", async () => {
    const f = fixture("dry");
    const brushes = await writeVmfSolidTool.handler({ path:f.path,solids:[box,box],dryRun:true,backup:true } as never,ctx) as any;
    expect(brushes.verified).toHaveLength(2);
    const entities = await editVmf.handler({ path:f.path,ops:[{op:"add",keyvalues:{classname:"info_director"}},{op:"add",keyvalues:{classname:"info_player_start"}}],dryRun:true,backup:true } as never,ctx) as any;
    expect(entities.entitiesAfter).toBe(3);
    intact(f);
  });
});
