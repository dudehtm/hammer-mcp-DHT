import { parse } from "../kv/parse.js";
import type { KvBlock, KvNode } from "../kv/parse.js";

const block = (items: readonly KvNode[], name: string): KvBlock | undefined =>
  items.find((item): item is KvBlock => item.kind === "block" &&
    item.name.toLowerCase() === name.toLowerCase());

function value(parent: KvBlock, key: string): string | undefined {
  const pair = parent.entries.find((item) => item.kind === "pair" && item.key.toLowerCase() === key.toLowerCase());
  return pair?.kind === "pair" ? pair.value : undefined;
}

export interface MissionMap { mode: string; chapter: number; map: string; present: boolean | null }
export interface MissionAudit { name: string | null; version: string | null; maps: MissionMap[]; errors: string[]; review: string[] }

/** Structure checked against Valve's installed sdk_content/DeadLine2 mission example. */
export function inspectL4d2Mission(source: string, mapExists?: (map: string) => boolean): MissionAudit {
  const errors: string[] = [];
  const review: string[] = [];
  const root = block(parse(source), "mission");
  if (!root) return { name: null, version: null, maps: [], errors: ["Missing mission block."], review };
  const name = value(root, "Name") ?? null;
  const version = value(root, "Version") ?? null;
  if (!name) errors.push("Mission Name is missing.");
  if (!version || !/^\d+$/.test(version)) errors.push("Mission Version must be a whole number.");
  const modes = block(root.entries, "modes");
  if (!modes) errors.push("Mission modes block is missing.");
  const maps: MissionMap[] = [];
  for (const mode of modes?.entries ?? []) {
    if (mode.kind !== "block") continue;
    for (const chapter of mode.entries) {
      if (chapter.kind !== "block") continue;
      const number = Number(chapter.name);
      if (!Number.isInteger(number) || number < 1) {
        errors.push(`Invalid chapter number ${chapter.name} in ${mode.name}.`);
        continue;
      }
      const map = value(chapter, "Map") ?? "";
      if (!/^[A-Za-z0-9_-]+$/.test(map)) {
        errors.push(`Invalid Map name in ${mode.name} chapter ${number}: ${JSON.stringify(map)}.`);
        continue;
      }
      const present = mapExists ? mapExists(map) : null;
      if (present === false) errors.push(`${mode.name} chapter ${number} references missing ${map}.bsp.`);
      maps.push({ mode: mode.name, chapter: number, map, present });
    }
  }
  if (maps.length === 0) errors.push("Mission declares no chapter maps.");
  if (!mapExists && maps.length > 0) review.push("No maps directory was supplied; BSP presence is unverified.");
  return { name, version, maps, errors, review };
}

export function inspectL4d2AddonInfo(source: string): string[] {
  const root = block(parse(source), "AddonInfo");
  if (!root) return ["Missing AddonInfo block."];
  const errors: string[] = [];
  if (value(root, "addonSteamAppID") !== "550") errors.push("addonSteamAppID must be 550 for L4D2.");
  if (!value(root, "addontitle")) errors.push("addontitle is missing.");
  return errors;
}
