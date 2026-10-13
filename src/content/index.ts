import { createHash } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../config.js";
import { assertWritable } from "../fs/guard.js";
import { writeGuarded } from "../fs/write.js";

/** A disposable index belongs to the selected profile and real game directory. */
export function contentIndexPath(config: Config, profile: string, gameDir: string | null): string | null {
  if (!gameDir) return null;
  const identity = createHash("sha256").update(profile + "\0" + realpathSync(gameDir)).digest("hex");
  return assertWritable(join(config.stateDir, `content-index-${identity}.json`), config);
}

export function persistContentIndex(path: string, value: unknown, config: Config): void {
  const target = assertWritable(path, config);
  mkdirSync(assertWritable(dirname(target), config), { recursive: true });
  writeGuarded(target, JSON.stringify(value), config, { atomic: true });
}
