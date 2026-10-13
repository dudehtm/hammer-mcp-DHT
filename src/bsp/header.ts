import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * `VBSP` header: ident[4] + version + lump_t[64] + mapRevision.
 * lump_t is { int fileofs; int filelen; int version; char fourCC[4] } = 16 bytes.
 */
export const HEADER_BYTES = 4 + 4 + 64 * 16 + 4; // 1036
export const LUMP_COUNT = 64;
/** Byte offset of mapRevision. A `.lmp` patch whose revision differs is ignored in silence. */
export const MAP_REVISION_OFFSET = 4 + 4 + 64 * 16; // 1032

/** Lump index for the entity list -- plain KeyValues text, NUL-terminated. */
export const LUMP_ENTITIES = 0;
/** Brush models. Model 0 is the world, and its bounding box is the map's real extent. */
export const LUMP_MODELS = 14;
/** The embedded pakfile: a plain ZIP, and on `rp_nycity_day` 1004 MB of the 1.13 GB. */
export const LUMP_PAKFILE = 40;

/**
 * Lump names, from `LUMP_*` in `src/public/bspfile.h` of source-sdk-2013, read 11/08/2026.
 *
 * Read from the header rather than remembered, because the HDR family is easy to get wrong
 * and wrong in a way that reads as right. Index 56 is **not** `LIGHTING_HDR` -- it is
 * `LEAF_AMBIENT_LIGHTING`, which is present in LDR maps too. Labelling it as HDR makes
 * every LDR map look HDR-compiled, and an audit of a map's lighting then concludes the
 * opposite of the truth with nothing to flag it. That mislabel shipped here and was caught
 * on three real maps.
 *
 * The five HDR-family lumps and their two indexes are all named, so that a caller reading
 * a lump directory can tell "this map has no HDR data" from "this tool does not know that
 * lump".
 *
 * `geometry.ts` derives its own names from this table. Two hand-maintained lists is what
 * let the two disagree in the first place, one of them silently.
 */
export const LUMP_NAMES: Readonly<Record<number, string>> = {
  0: "ENTITIES",
  1: "PLANES",
  2: "TEXDATA",
  3: "VERTEXES",
  4: "VISIBILITY",
  5: "NODES",
  6: "TEXINFO",
  7: "FACES",
  8: "LIGHTING",
  9: "OCCLUSION",
  10: "LEAFS",
  11: "FACEIDS",
  12: "EDGES",
  13: "SURFEDGES",
  14: "MODELS",
  15: "WORLDLIGHTS",
  16: "LEAFFACES",
  17: "LEAFBRUSHES",
  18: "BRUSHES",
  19: "BRUSHSIDES",
  20: "AREAS",
  21: "AREAPORTALS",
  22: "DISPINFO",
  23: "ORIGINALFACES",
  26: "DISP_VERTS",
  35: "GAME_LUMP",
  40: "PAKFILE",
  42: "CUBEMAPS",
  43: "TEXDATA_STRING_DATA",
  44: "TEXDATA_STRING_TABLE",
  45: "OVERLAYS",
  51: "LEAF_AMBIENT_INDEX_HDR",
  52: "LEAF_AMBIENT_INDEX",
  53: "LIGHTING_HDR",
  54: "WORLDLIGHTS_HDR",
  55: "LEAF_AMBIENT_LIGHTING_HDR",
  56: "LEAF_AMBIENT_LIGHTING",
  57: "XZIPPAKFILE",
  58: "FACES_HDR",
  59: "MAP_FLAGS",
  60: "OVERLAY_FADES",
};

/**
 * The lumps vrad writes only when it produced HDR lighting.
 *
 * All three empty means the map is LDR-only. Deliberately not index 56: it carries
 * per-visleaf ambient lighting and is present either way, which is exactly the trap this
 * constant exists to keep callers out of.
 */
export const HDR_LUMPS = [53, 54, 58] as const;

/** First four bytes of an individually compressed lump. */
export const LZMA_MAGIC = "LZMA";

/** Descriptor field order used by the BSP variants this reader accepts. */
export type BspDescriptorLayout = "source" | "l4d2";

export interface BspLump {
  index: number;
  name: string | undefined;
  offset: number;
  /** Bytes occupied in the file. For a compressed lump this is the COMPRESSED size. */
  length: number;
  version: number;
  fourCC: number;
  /**
   * Whether this lump is individually LZMA-compressed, read from its first four bytes.
   *
   * Source allows any lump to be compressed on its own. When it is, `length` counts
   * compressed bytes, so dividing it by a record size yields a plausible, wrong count --
   * and only sometimes an obviously wrong one, since a compressed length lands on a
   * multiple of the record size roughly one time in `bytes`.
   */
  compressed: boolean;
  /**
   * Uncompressed size a compressed lump DECLARES in its fourCC field. Null otherwise.
   *
   * Declared, not verified: checking it would mean decompressing, and nothing here does.
   * Reported so a caller can size the real data, never used to compute a record count.
   */
  declaredUncompressedBytes: number | null;
}

export interface BspHeader {
  path: string;
  ident: string;
  version: number;
  /** Descriptor layout selected by structural validation, not by BSP version alone. */
  layout: BspDescriptorLayout;
  /** Copy this into any `.lmp` patch built against this BSP. */
  mapRevision: number;
  fileSize: number;
  lumps: BspLump[];
}

export class BspFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BspFormatError";
  }
}

/** Reads exactly `length` bytes at `offset`, without mapping the file. */
export function readAt(path: string, offset: number, length: number): Buffer {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new BspFormatError(`${path}: cannot read at invalid offset ${offset}`);
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new BspFormatError(`${path}: cannot read invalid length ${length}`);
  }
  const buf = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    const got = readSync(fd, buf, 0, length, offset);
    if (got < length) {
      throw new BspFormatError(
        `${path}: short read at offset ${offset}: expected ${length} bytes, got ${got}`,
      );
    }
    return buf;
  } finally {
    closeSync(fd);
  }
}

/** Creates normalized lumps from one possible descriptor field order. */
function decodeLumps(
  view: DataView,
  layout: BspDescriptorLayout,
): BspLump[] {
  const lumps: BspLump[] = [];
  for (let i = 0; i < LUMP_COUNT; i++) {
    const at = 8 + i * 16;
    const first = view.getInt32(at, true);
    const second = view.getInt32(at + 4, true);
    const third = view.getInt32(at + 8, true);
    const offset = layout === "source" ? first : second;
    const length = layout === "source" ? second : third;
    const version = layout === "source" ? third : first;
    lumps.push({
      index: i,
      name: LUMP_NAMES[i],
      offset,
      length,
      version,
      fourCC: view.getInt32(at + 12, true),
      compressed: false,
      declaredUncompressedBytes: null,
    });
  }
  return lumps;
}

/** Validates directory-level invariants shared by every supported BSP layout. */
function validateLumps(
  path: string,
  fileSize: number,
  lumps: readonly BspLump[],
): string[] {
  const errors: string[] = [];
  const occupied: Array<{ lump: BspLump; end: number }> = [];

  for (const lump of lumps) {
    if (!Number.isSafeInteger(lump.offset) || lump.offset < 0) {
      errors.push(`lump ${lump.index} has a negative or invalid offset ${lump.offset}`);
      continue;
    }
    if (!Number.isSafeInteger(lump.length) || lump.length < 0) {
      errors.push(`lump ${lump.index} has a negative or invalid length ${lump.length}`);
      continue;
    }
    if (lump.offset > fileSize) {
      errors.push(`lump ${lump.index} starts at ${lump.offset}, past file size ${fileSize}`);
      continue;
    }
    if (lump.length > fileSize - lump.offset) {
      errors.push(
        `lump ${lump.index} runs past end of file (${lump.offset}+${lump.length} > ${fileSize})`,
      );
      continue;
    }
    if (lump.length === 0) continue;
    if (lump.offset < HEADER_BYTES) {
      errors.push(
        `lump ${lump.index} starts at ${lump.offset}, inside the ${HEADER_BYTES}-byte header`,
      );
      continue;
    }
    occupied.push({ lump, end: lump.offset + lump.length });
  }

  occupied.sort((a, b) => a.lump.offset - b.lump.offset);
  for (let i = 1; i < occupied.length; i++) {
    const previous = occupied[i - 1]!;
    const current = occupied[i]!;
    if (current.lump.offset < previous.end) {
      errors.push(
        `lumps ${previous.lump.index} and ${current.lump.index} overlap ` +
          `(${previous.lump.offset}-${previous.end}, ${current.lump.offset}-${current.end})`,
      );
    }
  }

  const entities = lumps[0];
  if (!entities || entities.length === 0) {
    errors.push("ENTITIES lump is empty");
  }

  const models = lumps[14];
  if (models && models.length > 0 && models.length % 48 !== 0) {
    errors.push(`MODELS lump is ${models.length} bytes, not a multiple of 48`);
  }

  return errors;
}

function describeCandidate(layout: BspDescriptorLayout, errors: readonly string[]): string {
  return errors.length === 0 ? `${layout}: valid` : `${layout}: ${errors.join("; ")}`;
}

/**
 * Reads a BSP header.
 *
 * Only the first 1036 bytes are touched, plus four bytes at the start of each non-empty
 * lump to see whether it is compressed. This matters more than it looks: the project's
 * own map is 1.13 GB, and a `readFileSync` inside an MCP server dies with the stdio
 * transport open, which the agent sees as a hang rather than an error.
 */
export function readHeader(path: string): BspHeader {
  const size = statSync(path).size;
  if (size < HEADER_BYTES) {
    throw new BspFormatError(`${path}: too small to be a BSP (${size} bytes)`);
  }

  const buf = readAt(path, 0, HEADER_BYTES);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const ident = buf.subarray(0, 4).toString("ascii");
  if (ident !== "VBSP") {
    throw new BspFormatError(`${path}: not a VBSP file (ident ${JSON.stringify(ident)})`);
  }

  const version = view.getInt32(4, true);
  // 19 = HL2/EP1, 20 = Source 2007 onwards and Garry's Mod, 21 = L4D2/Portal 2 era.
  if (version < 19 || version > 21) {
    throw new BspFormatError(`${path}: unsupported BSP version ${version} (expected 19-21)`);
  }

  const candidates = (["source", "l4d2"] as const).map((layout) => {
    const lumps = decodeLumps(view, layout);
    return { layout, lumps, errors: validateLumps(path, size, lumps) };
  });
  const valid = candidates.filter((candidate) => candidate.errors.length === 0);
  if (valid.length === 0) {
    throw new BspFormatError(
      `${path}: no valid BSP lump descriptor layout; ` +
        candidates.map((candidate) => describeCandidate(candidate.layout, candidate.errors)).join(" | "),
    );
  }
  if (valid.length > 1) {
    throw new BspFormatError(
      `${path}: ambiguous BSP lump descriptor layout; ` +
        valid.map((candidate) => candidate.layout).join(" and ") +
        " both pass structural validation",
    );
  }

  const selected = valid[0]!;
  const lumps = selected.lumps.map((lump) => {
    // Four bytes per non-empty lump. A compressed lump starts with the ASCII magic
    // "LZMA", and its fourCC carries the uncompressed size instead of a codec tag.
    const compressed =
      lump.length >= 4 && readAt(path, lump.offset, 4).toString("ascii") === LZMA_MAGIC;
    return {
      ...lump,
      compressed,
      declaredUncompressedBytes: compressed ? lump.fourCC : null,
    };
  });

  return {
    path,
    ident,
    version,
    layout: selected.layout,
    mapRevision: view.getInt32(MAP_REVISION_OFFSET, true),
    fileSize: size,
    lumps,
  };
}

/** The lump descriptor for `index`, or throws when it is empty. */
export function requireLump(header: BspHeader, index: number): BspLump {
  const lump = header.lumps[index];
  if (!lump) throw new BspFormatError(`${header.path}: no lump ${index}`);
  if (lump.length <= 0) throw new BspFormatError(`${header.path}: lump ${index} is empty`);
  if (lump.offset + lump.length > header.fileSize) {
    throw new BspFormatError(
      `${header.path}: lump ${index} runs past end of file ` +
        `(${lump.offset}+${lump.length} > ${header.fileSize})`,
    );
  }
  return lump;
}

/** Returns a lump whose body can be read as uncompressed records or text. */
export function requireUncompressedLump(header: BspHeader, index: number): BspLump {
  const lump = requireLump(header, index);
  if (lump.compressed) {
    throw new BspFormatError(
      `${header.path}: lump ${index} (${lump.name ?? index}) is individually LZMA-compressed; ` +
        `refusing rather than decoding compressed bytes as records. It declares ` +
        `${lump.declaredUncompressedBytes} uncompressed bytes, not verified here.`,
    );
  }
  return lump;
}
