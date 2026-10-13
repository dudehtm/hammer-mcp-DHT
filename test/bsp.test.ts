import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEntityText, readEntityLump } from "../src/bsp/entities.js";
import {
  BspFormatError,
  HEADER_BYTES,
  LUMP_COUNT,
  MAP_REVISION_OFFSET,
  readAt,
  readHeader,
} from "../src/bsp/header.js";
import { histogram } from "../src/entity/model.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const PROBE = join(FIXTURES, "hmcp_probe.bsp");

function syntheticBsp(layout: "source" | "l4d2", version = 21): string {
  const entity = Buffer.from('{\n"classname" "worldspawn"\n}\n\0', "utf8");
  const model = Buffer.alloc(48);
  const entityOffset = HEADER_BYTES;
  const modelOffset = entityOffset + entity.length;
  const buf = Buffer.alloc(modelOffset + model.length + 16);
  buf.write("VBSP", 0, "ascii");
  buf.writeInt32LE(version, 4);
  buf.writeInt32LE(7, MAP_REVISION_OFFSET);

  const descriptor = (index: number, offset: number, length: number, lumpVersion = 0): void => {
    const at = 8 + index * 16;
    if (layout === "source") {
      buf.writeInt32LE(offset, at);
      buf.writeInt32LE(length, at + 4);
      buf.writeInt32LE(lumpVersion, at + 8);
    } else {
      buf.writeInt32LE(lumpVersion, at);
      buf.writeInt32LE(offset, at + 4);
      buf.writeInt32LE(length, at + 8);
    }
  };

  descriptor(0, entityOffset, entity.length);
  descriptor(14, modelOffset, model.length);
  entity.copy(buf, entityOffset);
  model.copy(buf, modelOffset);

  expect(LUMP_COUNT).toBe(64);
  const path = join(tmpdir(), `hmcp-layout-${layout}-${process.pid}-${Date.now()}.bsp`);
  writeFileSync(path, buf);
  return path;
}

describe("BSP header", () => {
  it("reads ident, version and mapRevision from the probe map", () => {
    const h = readHeader(PROBE);
    expect(h.ident).toBe("VBSP");
    expect(h.version).toBe(20);
    expect(h.layout).toBe("source");
    // The probe VMF declares mapversion 1, and vbsp copies it into the header.
    expect(h.mapRevision).toBe(1);
    expect(h.lumps).toHaveLength(64);
  });

  it("puts mapRevision at offset 1032, where the .lmp writer looks for it", () => {
    expect(MAP_REVISION_OFFSET).toBe(1032);
    expect(HEADER_BYTES).toBe(1036);
    const raw = readFileSync(PROBE);
    expect(raw.readInt32LE(MAP_REVISION_OFFSET)).toBe(readHeader(PROBE).mapRevision);
  });

  it("names the entity lump and reports a plausible size", () => {
    const lump = readHeader(PROBE).lumps[0]!;
    expect(lump.name).toBe("ENTITIES");
    expect(lump.length).toBeGreaterThan(0);
  });

  it("refuses a file that is not VBSP", () => {
    const path = join(tmpdir(), `hmcp-not-a-bsp-${process.pid}.bsp`);
    const buf = Buffer.alloc(HEADER_BYTES);
    buf.write("XBSP", 0, "ascii");
    writeFileSync(path, buf);
    expect(() => readHeader(path)).toThrow(BspFormatError);
  });

  it("refuses an unsupported version", () => {
    const path = join(tmpdir(), `hmcp-bad-version-${process.pid}.bsp`);
    const buf = Buffer.alloc(HEADER_BYTES);
    buf.write("VBSP", 0, "ascii");
    buf.writeInt32LE(17, 4);
    writeFileSync(path, buf);
    expect(() => readHeader(path)).toThrow(/unsupported BSP version 17/);
  });

  it("refuses a file too short to hold a header", () => {
    const path = join(tmpdir(), `hmcp-short-${process.pid}.bsp`);
    writeFileSync(path, Buffer.alloc(64));
    expect(() => readHeader(path)).toThrow(/too small/);
  });

  it("recognises the observed L4D2 descriptor order structurally", () => {
    const path = syntheticBsp("l4d2");
    const h = readHeader(path);
    expect(h.version).toBe(21);
    expect(h.layout).toBe("l4d2");
    expect(h.lumps[0]).toMatchObject({ offset: HEADER_BYTES, length: expect.any(Number), version: 0 });
    expect(h.lumps[14]).toMatchObject({ offset: expect.any(Number), length: 48, version: 0 });
  });

  it("does not select L4D2 only because the BSP version is 21", () => {
    const path = syntheticBsp("source", 21);
    expect(readHeader(path).layout).toBe("source");
  });

  it("rejects an ambiguous descriptor order instead of guessing", () => {
    const path = join(tmpdir(), `hmcp-ambiguous-${process.pid}.bsp`);
    const buf = Buffer.alloc(7000);
    buf.write("VBSP", 0, "ascii");
    buf.writeInt32LE(21, 4);
    buf.writeInt32LE(4000, 8);
    buf.writeInt32LE(2000, 12);
    buf.writeInt32LE(100, 16);
    buf.write("{}\0", 2000, "ascii");
    buf.write("{}\0", 4000, "ascii");
    writeFileSync(path, buf);
    expect(() => readHeader(path)).toThrow(/ambiguous.*source.*l4d2/i);
  });

  it("rejects invalid ranges and overlaps before a reader touches a lump", () => {
    const path = join(tmpdir(), `hmcp-invalid-range-${process.pid}.bsp`);
    const buf = Buffer.alloc(1500);
    buf.write("VBSP", 0, "ascii");
    buf.writeInt32LE(20, 4);
    buf.writeInt32LE(HEADER_BYTES, 8);
    buf.writeInt32LE(100, 12);
    buf.writeInt32LE(1400, 8 + 14 * 16);
    buf.writeInt32LE(200, 12 + 14 * 16);
    writeFileSync(path, buf);
    expect(() => readHeader(path)).toThrow(/past end of file|no valid/i);
  });

  it("rejects a short read with the path and requested range", () => {
    const path = join(tmpdir(), `hmcp-short-read-${process.pid}.bsp`);
    writeFileSync(path, Buffer.from("short"));
    expect(() => readAt(path, 0, 10)).toThrow(/short read.*expected 10 bytes, got 5/);
  });
});

describe("entity lump", () => {
  it("reads the probe map's entities and finds the marker we placed", () => {
    const lump = readEntityLump(PROBE);
    expect(lump.nulTerminated).toBe(true);
    const names = lump.entities.map((e) => e.classname);
    expect(names).toContain("worldspawn");
    expect(names).toContain("info_player_start");
    expect(names).toContain("light");
    const probe = lump.entities.find((e) => e.targetname === "hmcp_probe");
    expect(probe?.classname).toBe("info_target");
    expect(probe?.origin).toEqual([0, 0, 64]);
  });

  it("indexes entities in source order", () => {
    const lump = readEntityLump(PROBE);
    expect(lump.entities.map((e) => e.index)).toEqual(lump.entities.map((_, i) => i));
  });

  it("counts classnames, most frequent first", () => {
    const h = histogram(parseEntityText('{"classname" "a"}{"classname" "b"}{"classname" "a"}'));
    expect(h[0]).toEqual(["a", 2]);
    expect(h[1]).toEqual(["b", 1]);
  });

  it("rejects VMF body text rather than silently reporting zero entities", () => {
    // Handing a VMF to a BSP-entity reader must say so. Returning [] here would read as
    // "this map has no entities" instead of "you gave me the wrong thing".
    expect(() => parseEntityText('world\n{\n"classname" "worldspawn"\n}\n')).toThrow(
      /expected an anonymous/,
    );
  });
});
