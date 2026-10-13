import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { gameBlock, gameFor } from "../games/resolve.js";
import { surveyL4d2Setup } from "../l4d2/setup.js";
import { inspectL4d2AddonInfo, inspectL4d2Mission } from "../l4d2/mission.js";
import { defineTool } from "../mcp/registry.js";
import { resolveInput, resolveVmfInput } from "./paths.js";
import { readVmfLint } from "./vmf.js";
import { validateIoTool } from "./wiring.js";

export const checkL4d2Map = defineTool({
  name: "check_l4d2_map",
  description:
    "Read-only L4D2 VMF preflight for an agent: inventories survivor, Director, transition " +
    "and finale markers, then runs the game's FGD lint and I/O validation. Missing markers " +
    "are review prompts, not proof of a broken map. Requires the Python sidecar. NAV, " +
    "Director flow, bots and playability still require an in-game check.",
  realm: "map",
  inputSchema: {
    path: z.string().describe("Path to the source .vmf."),
    role: z.enum(["prototype", "chapter", "finale"]).default("prototype"),
    collapseInstances: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
  },
  outputSchema: {
    path: z.string(),
    game: z.object({ id: z.string(), branch: z.string() }),
    setup: z.object({
      role: z.enum(["prototype", "chapter", "finale"]),
      entityCount: z.number(),
      markers: z.record(z.number()),
      review: z.array(z.string()),
    }),
    fgd: z.object({ loaded: z.array(z.string()), errors: z.number(), warnings: z.number(), findings: z.array(z.unknown()) }),
    io: z.object({ connections: z.number(), classesChecked: z.number(), errors: z.number(), warnings: z.number(), unresolvedTargets: z.array(z.string()), findings: z.array(z.unknown()) }),
    status: z.enum(["errors", "review", "offline_checked"]),
    runtimeRequired: z.array(z.string()),
  },
  handler: async (args, ctx) => {
    const { game, from } = gameFor(ctx.config, "l4d2");
    if (game.branch !== "l4d2") throw new Error("The l4d2 profile must use the l4d2 engine branch.");
    const path = resolveVmfInput(args.path, ctx.config);
    const setup = surveyL4d2Setup(readFileSync(path, "utf8"), args.role);
    const lint = await readVmfLint.handler(
      { path, game: "l4d2", collapseInstances: args.collapseInstances, limit: args.limit }, ctx,
    );
    const io = await validateIoTool.handler({ path, game: "l4d2", limit: args.limit }, ctx);
    const bySeverity = lint.bySeverity as Record<string, number>;
    const unresolvedTargets = io.unresolvedTargets as string[];
    const ioErrors = io.errorCount as number;
    const ioWarnings = io.warningCount as number;
    const errors = bySeverity["error"] ?? 0;
    const warnings = bySeverity["warning"] ?? 0;
    return {
      path,
      game: gameBlock(game, from),
      setup,
      fgd: { loaded: lint.fgdsLoaded, errors, warnings, findings: lint.findings },
      io: {
        connections: io.connectionCount,
        classesChecked: io.classesChecked,
        errors: ioErrors,
        warnings: ioWarnings,
        unresolvedTargets,
        findings: io.findings,
      },
      status: errors + ioErrors > 0 ? "errors" :
        setup.review.length + warnings + ioWarnings + unresolvedTargets.length > 0 ? "review" : "offline_checked",
      runtimeRequired: ["NAV generation and flow", "survivor and infected bots", "Director events and finale", "visual and performance check in L4D2"],
    };
  },
});

export const checkL4d2Mission = defineTool({
  name: "check_l4d2_mission",
  description:
    "Checks an L4D2 mission file's chapter map references and optional addoninfo.txt against " +
    "the installed Authoring Tools example. A maps directory enables BSP presence checks. " +
    "This is file structure only; mission_reload and game modes still need L4D2.",
  realm: "map",
  inputSchema: {
    mission: z.string().describe("Path to missions/<name>.txt."),
    mapsDir: z.string().optional().describe("Directory containing the referenced .bsp files."),
    addonInfo: z.string().optional().describe("Optional addoninfo.txt to check for AppID 550 and title."),
  },
  outputSchema: {
    mission: z.string(),
    name: z.string().nullable(),
    version: z.string().nullable(),
    maps: z.array(z.object({ mode: z.string(), chapter: z.number(), map: z.string(), present: z.boolean().nullable() })),
    errors: z.array(z.string()),
    review: z.array(z.string()),
    status: z.enum(["errors", "review", "offline_checked"]),
  },
  handler: (args, ctx) => {
    const mission = resolveInput(args.mission, ctx.config);
    const mapsDir = args.mapsDir ? resolveInput(args.mapsDir, ctx.config) : undefined;
    const audit = inspectL4d2Mission(
      readFileSync(mission, "utf8"),
      mapsDir ? (map) => existsSync(join(mapsDir, `${map}.bsp`)) : undefined,
    );
    const errors = [
      ...audit.errors,
      ...(args.addonInfo ? inspectL4d2AddonInfo(readFileSync(resolveInput(args.addonInfo, ctx.config), "utf8")) : []),
    ];
    const review = [...audit.review];
    if (!args.addonInfo) review.push("No addoninfo.txt was supplied; add-on metadata is unverified.");
    return {
      mission,
      name: audit.name,
      version: audit.version,
      maps: audit.maps,
      errors,
      review,
      status: errors.length > 0 ? "errors" : review.length > 0 ? "review" : "offline_checked",
    };
  },
});

export const l4d2Tools = [checkL4d2Map, checkL4d2Mission];
