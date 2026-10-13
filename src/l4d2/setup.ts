import { readEntities } from "../vmf/edit.js";

/** Classes observed in the installed left4dead2.fgd on 2026-10-12. */
const MARKERS = ["info_player_start", "info_director", "info_changelevel", "trigger_finale"] as const;
export type L4d2MapRole = "prototype" | "chapter" | "finale";

export interface L4d2Setup {
  role: L4d2MapRole;
  entityCount: number;
  markers: Record<(typeof MARKERS)[number], number>;
  review: string[];
}

/** A factual inventory plus review prompts; entity presence alone cannot prove playability. */
export function surveyL4d2Setup(source: string, role: L4d2MapRole): L4d2Setup {
  const { entities } = readEntities(source);
  const markers = Object.fromEntries(MARKERS.map((name) => [name, 0])) as L4d2Setup["markers"];
  for (const entity of entities) {
    const name = entity.classname.toLowerCase() as (typeof MARKERS)[number];
    if (name in markers) markers[name]++;
  }
  const review: string[] = [];
  if (entities.some((entity) => entity.classname.toLowerCase() === "func_instance"))
    review.push("func_instance is present; this marker inventory and I/O check see only the root VMF. Inspect expanded instances separately.");
  if (markers.info_player_start === 0) review.push("No info_player_start was found; verify survivor spawning in L4D2.");
  if (markers.info_director === 0) review.push("No info_director was found; verify Director behavior in L4D2.");
  if (role === "chapter" && markers.info_changelevel === 0)
    review.push("No info_changelevel was found; verify this chapter's transition in L4D2.");
  if (role === "finale" && markers.trigger_finale === 0)
    review.push("No trigger_finale was found; verify the finale sequence in L4D2.");
  return { role, entityCount: entities.length, markers, review };
}
