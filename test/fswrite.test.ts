import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { WriteOutsideRoots } from "../src/fs/guard.js";
import { replaceGuardedFile } from "../src/fs/write.js";
import { config } from "./support/env.js";

const scratch = mkdtempSync(join(tmpdir(), "hammer-guarded-replace-"));
const outside = mkdtempSync(join(tmpdir(), "hammer-guarded-replace-outside-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("replaceGuardedFile", () => {
  it("replaces an existing target with a guarded sibling file", () => {
    const restricted = { ...config, writeRoots: [scratch] } as Config;
    const source = join(scratch, "compiled.tmp.bsp");
    const destination = join(scratch, "map.bsp");
    writeFileSync(source, "verified compiled bytes");
    writeFileSync(destination, "original bytes");

    replaceGuardedFile(source, destination, restricted);

    expect(readFileSync(destination, "utf8")).toBe("verified compiled bytes");
    expect(existsSync(source)).toBe(false);
  });

  it("refuses an out-of-root target and leaves the source in place", () => {
    const restricted = { ...config, writeRoots: [scratch] } as Config;
    const source = join(scratch, "still-here.tmp.bsp");
    const destination = join(outside, "must-not-change.bsp");
    writeFileSync(source, "verified compiled bytes");
    writeFileSync(destination, "original bytes");

    expect(() => replaceGuardedFile(source, destination, restricted)).toThrow(WriteOutsideRoots);
    expect(readFileSync(source, "utf8")).toBe("verified compiled bytes");
    expect(readFileSync(destination, "utf8")).toBe("original bytes");
  });
});
