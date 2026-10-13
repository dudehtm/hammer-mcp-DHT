import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { run } from "@projectsociety/mcp-core";
import { contentIndexPath, persistContentIndex } from "../src/content/index.js";
import { readGameContentTool } from "../src/tools/content.js";
import { pythonPath } from "../src/sidecar/client.js";
import type { ToolContext } from "../src/mcp/registry.js";
import { config as sharedConfig, has } from "./support/env.js";

const scratch = mkdtempSync(join(tmpdir(), "hammer-content-index-"));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fixture(name: string) {
  const root = join(scratch, name);
  const gameDir = join(root, "game");
  mkdirSync(join(gameDir, "materials", "brick"), { recursive: true });
  mkdirSync(join(gameDir, "models"));
  writeFileSync(join(gameDir, "gameinfo.txt"), '"GameInfo"\n{\n"game" "test"\n"FileSystem"\n{\n"SearchPaths"\n{\n"Game" "|gameinfo_path|."\n}\n}\n}\n');
  for (const item of ["c", "a", "b"]) writeFileSync(join(gameDir, "materials", "brick", item + ".vmt"), '"UnlitGeneric" {}');
  writeFileSync(join(gameDir, "models", "probe.mdl"), "name-only probe");
  const config = { ...sharedConfig, sidecarPython: pythonPath(sharedConfig), game: "l4d2", repoRoot: root, stateDir: join(root, "state"), explicit: {},
    gameProfiles: { l4d2: { gameDir, gameRoot: root, binDir: root } } };
  const record = vi.fn();
  const ctx = { config, audit: { record } } as unknown as ToolContext;
  const search = async (extra: Record<string, unknown> = {}) =>
    readGameContentTool.handler({ pattern: "brick", kind: "material", offset: 0, limit: 2, ...extra } as never, ctx) as Promise<any>;
  return { root, gameDir, config, ctx, search, record };
}

describe("disposable content index", () => {
  it.skipIf(!has.sidecar)("keeps pages stable across rebuild and hit, reads details live, and records timings", async () => {
    const f = fixture("pages");
    const first = await f.search();
    expect(first.cache).toMatchObject({ status: "rebuilt", persisted: true });
    expect(first.results.map((row: any) => row.name)).toEqual(["BRICK/A", "BRICK/B"]);
    expect(first).toMatchObject({ total: 3, shown: 2, truncated: true });
    expect(first.results[0].shader).toBeUndefined();
    const page = await f.search({ offset: 2 });
    expect(page.cache.status).toBe("hit");
    expect(page.results.map((row: any) => row.name)).toEqual(["BRICK/C"]);
    expect(page.truncated).toBe(false);
    writeFileSync(join(f.gameDir, "materials", "brick", "a.vmt"), '"VertexLitGeneric" {}');
    const details = await f.search({ details: true });
    expect(details.cache.status).toBe("hit");
    expect(details.results[0].shader).toBe("VertexLitGeneric");
    const models = await f.search({ pattern: "probe", kind: "model" });
    expect(models.cache.status).toBe("hit");
    expect(models.results[0].path).toBe("models/probe.mdl");
    const empty = await f.search({ offset: 99 });
    expect(empty).toMatchObject({ total: 3, shown: 0, truncated: false });
    expect(details.timings.walkMs).toBe(0);
    expect(details.timings.serializationMs).toBeGreaterThanOrEqual(0);
    expect(details.timings.processMs).toBeGreaterThan(0);
    expect(f.record).toHaveBeenCalledWith(expect.objectContaining({ kind: "content_search", data: expect.objectContaining({ timings: details.timings }) }));
    expect(first._indexUpdate).toBeUndefined();
  }, 30_000);

  it.skipIf(!has.sidecar)("invalidates nested loose additions, removals and gameinfo, and recovers corrupt or forced indexes", async () => {
    const f = fixture("invalidate");
    await f.search();
    const folder = join(f.gameDir, "materials", "brick", "nested");
    mkdirSync(folder);
    const file = join(folder, "new.vmt");
    writeFileSync(file, '"UnlitGeneric" {}');
    expect(await f.search()).toMatchObject({ cache: { status: "rebuilt" }, total: 4 });
    rmSync(file);
    expect(await f.search()).toMatchObject({ cache: { status: "rebuilt" }, total: 3 });
    const info = join(f.gameDir, "gameinfo.txt");
    writeFileSync(info, readFileSync(info, "utf8") + "\n// updated mount configuration\n");
    expect((await f.search()).cache.status).toBe("rebuilt");
    const path = contentIndexPath(f.config, "l4d2", f.gameDir)!;
    writeFileSync(path, "invalid JSON");
    expect((await f.search()).cache.status).toBe("rebuilt");
    expect((await f.search()).cache.status).toBe("hit");
    expect((await f.search({ rebuildIndex: true })).cache.status).toBe("rebuilt");
  }, 30_000);

  it.skipIf(!has.sidecar)("searches normally when write roots prohibit an index", async () => {
    const f = fixture("read-only");
    f.config.writeRoots = [f.gameDir];
    const result = await f.search();
    expect(result).toMatchObject({ mounted: true, total: 3, cache: { status: "disabled" } });
    expect(result.cache.reason).toMatch(/outside the configured write roots/);
    expect(existsSync(f.config.stateDir)).toBe(false);
  }, 30_000);

  it.skipIf(!has.sidecar)("invalidates archive metadata and declines unsupported mount types", async () => {
    const file = join(scratch, "pak01_dir.vpk");
    writeFileSync(file, "metadata probe");
    const code = `import sys,json,os\nsys.path.insert(0,sys.argv[1])\nfrom content_index import signature\nfrom srctools.filesys import VPKFileSystem\nfrom types import SimpleNamespace\ns=VPKFileSystem.__new__(VPKFileSystem); s.path=sys.argv[2]\nf=SimpleNamespace(systems=[(s,'')])\na=signature(f,sys.argv[3])\nwith open(s.path,'a') as out: out.write('changed')\nb=signature(f,sys.argv[3])\nf.systems=[(SimpleNamespace(path=s.path),'')]\nprint(json.dumps({'before':a,'after':b,'unsupported':signature(f,sys.argv[3])}))`;
    const result = await run(pythonPath(sharedConfig), ["-c", code, join(process.cwd(), "sidecar"), file, scratch]);
    expect(result.code).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.before).toMatch(/^[a-f0-9]{64}$/);
    expect(data.after).not.toBe(data.before);
    expect(data.unsupported).toBeNull();
  }, 30_000);

  it("isolates profiles and installs, atomically replaces an index, and respects write roots", () => {
    const f = fixture("atomic");
    const path = contentIndexPath(f.config, "l4d2", f.gameDir)!;
    expect(contentIndexPath(f.config, "gmod", f.gameDir)).not.toBe(path);
    expect(contentIndexPath(f.config, "l4d2", f.root)).not.toBe(path);
    persistContentIndex(path, { version: 1 }, f.config);
    persistContentIndex(path, { version: 2 }, f.config);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 2 });
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error("simulated replacement failure"); });
    expect(() => persistContentIndex(path, { version: 3 }, f.config)).toThrow(/replacement failure/);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 2 });
    expect(readdirSync(f.config.stateDir)).toEqual([path.split(/[/\\]/).pop()]);
    const before = statSync(path).mtimeMs;
    f.config.writeRoots = [f.gameDir];
    expect(() => persistContentIndex(path, {}, f.config)).toThrow(/outside the configured write roots/);
    expect(statSync(path).mtimeMs).toBe(before);
  });
});
