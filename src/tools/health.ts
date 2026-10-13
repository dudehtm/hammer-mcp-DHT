import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { externalToolPresent } from "../compile/external.js";
import { toolchainDir } from "../compile/wine.js";
import { allGames, gameFor } from "../games/resolve.js";
import { defineTool } from "../mcp/registry.js";
import { run } from "../proc/run.js";
import { probeSidecar } from "../sidecar/client.js";
import { externalTools } from "./rename.js";
import { buildFreshness, VERSION } from "../version.js";

/**
 * Where this file is running from, and the source tree that should sit beside it.
 *
 * Compiled, this module is `dist/tools/health.js`, so the build root is two levels up and
 * `src/` is its sibling. Run from source under tsx the same arithmetic lands on a `src/src`
 * that does not exist, and `buildFreshness` reports that nothing was compared -- which is
 * the honest answer for a tree with no build to be stale.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(HERE, "..");
const SRC_DIR = join(BUILD_DIR, "..", "src");

/** The Source tools this server drives, all of them Windows binaries. */
const BINARIES = ["hammer.exe", "vbsp.exe", "vvis.exe", "vrad.exe", "vbspinfo.exe"];
/**
 * Extra .fgd files worth reporting on. The *required* ones are no longer listed here:
 * they come from the active game's own `gameinfo.txt`, so this stays correct for a game
 * nobody here owns.
 */
const EXTRA_FGDS = ["base.fgd", "halflife2.fgd"];

/**
 * The Hammer++ rebuild of the same compilers. Optional, and reported separately rather
 * than merged into the list above: they live in another directory, are x86-64 where the
 * stock ones are i386, and their absence is normal rather than a fault.
 */
const PLUSPLUS = [
  "vbspplusplus.exe",
  "vvisplusplus.exe",
  "vradplusplus.exe",
  "bspzipplusplus.exe",
];

export const health = defineTool({
  name: "health",
  description:
    "State of the toolchain this server depends on: repo root, the active game's bin directory " +
    "(which ships with the client, not with srcds), which compilers and .fgd files are " +
    "present, whether the native, Wine or Proton backend is configured, and whether the Python " +
    "sidecar (srctools) is installed. Also how many tools this server is serving and " +
    "whether its build is older than the source -- a stale build silently offers fewer " +
    "tools. Start here when a tool reports something missing, or is missing itself.",
  realm: "local",
  inputSchema: {},
  handler: async (_args, ctx) => {
    const { config } = ctx;
    const binDir = config.gmodBin;
    const binDirExists = existsSync(binDir);

    const wine =
      config.backend === "wine"
        ? await run("wine", ["--version"], { timeoutMs: 10_000 }).catch(() => null)
        : null;
    const sidecar = await probeSidecar(config);

    // Never throws: health has to stay callable precisely when the configuration is what
    // is wrong. A bad default profile id is reported, not raised.
    let active: ReturnType<typeof gameFor> | null = null;
    let gamesError: string | null = null;
    try {
      active = gameFor(config);
    } catch (e) {
      gamesError = e instanceof Error ? e.message : String(e);
    }
    const profiles = gamesError ? {} : allGames(config);
    const fgdList = [...(active?.game.fgd ?? []), ...EXTRA_FGDS];

    const plusDir = active?.game.id !== "gmod" && !active?.game.plusPlusBinDir
      ? null
      : toolchainDir(config, "plusplus", active?.game);
    const plusDirExists = plusDir !== null && existsSync(plusDir);
    const plusBinaries = Object.fromEntries(
      PLUSPLUS.map((b) => [b, plusDirExists && existsSync(join(plusDir!, b))]),
    );

    return {
      version: VERSION,
      // How many tools this server is actually serving, and whether the build it is
      // serving them from is older than the source. A stale build is silent: it does not
      // throw, it just offers fewer tools, and every symptom reads as a missing feature.
      tools: {
        // Null rather than 0 when no registry was handed in: a caller reading zero would
        // conclude the server serves nothing, which is a different and wrong diagnosis.
        count: ctx.registry?.list().length ?? null,
        build: buildFreshness(BUILD_DIR, SRC_DIR),
      },
      repoRoot: config.repoRoot,
      stateDir: config.stateDir,
      auditLog: ctx.audit.path,
      game: gamesError
        ? { error: gamesError, active: null, known: [] }
        : {
            error: null,
            active: {
              id: active!.game.id,
              displayName: active!.game.displayName,
              branch: active!.game.branch,
              gameDir: active!.game.gameDir,
              binDir: active!.game.binDir,
              fgd: active!.game.fgd,
              instancePath: active!.game.instancePath,
              unusableForCompile: active!.game.unusableForCompile,
              note: active!.game.note ?? null,
              // Which values were read off disk and which are built-in guesses. The profile
              // note carries the narrower evidence boundary for branches such as L4D2.
              provenance: active!.game.provenance,
            },
            known: Object.entries(profiles).map(([id, g]) => ({
              id,
              displayName: g.displayName,
              installed: g.gameDir !== null,
              usableForCompile: g.unusableForCompile === null,
              note: g.note ?? null,
            })),
          },
      toolchain: {
        gmodBin: binDir,
        present: binDirExists,
        binaries: Object.fromEntries(
          BINARIES.map((b) => [b, binDirExists && existsSync(join(binDir, b))]),
        ),
        fgd: Object.fromEntries(
          fgdList.map((f) => [f, binDirExists && existsSync(join(binDir, f))]),
        ),
        gameDir: config.gmodGameDir,
        gameDirPresent: existsSync(config.gmodGameDir),
      },
      editor: {
        hammer: binDirExists && existsSync(join(binDir, "hammer.exe")),
        hammerPlusPlus: binDirExists && existsSync(join(binDir, "hammerplusplus.exe")),
        note: "These are interactive editors. Hammer++ compiler availability is reported separately under plusplus.",
      },
      plusplus: {
        dir: plusDir,
        present: plusDirExists,
        binaries: plusBinaries,
        // Reported rather than inferred by the caller: "some of them" is the state that
        // produces a compile which starts and then fails at the second stage.
        usable: Object.values(plusBinaries).every(Boolean),
        note: active?.game.id === "l4d2"
          ? "Hammer++ is usable as an editor when hammerplusplus.exe is present. Its separate compiler chain is not configured for L4D2 here; run_compile falls back to L4D2 stock and reports that choice."
          : "Hammer++ compilers are separate from the editor. run_compile falls back to stock when this chain is absent and reports the choice.",
      },
      // Standalone tools that belong to no game install, so nothing can discover them.
      // Absent is the normal state and the tools that need them say where to get them;
      // reported here so that is knowable before a call rather than at one.
      externalTools: {
        dir: config.externalToolsDir,
        present: existsSync(config.externalToolsDir!),
        tools: externalTools.map((t) => ({
          exe: t.exe,
          tool: t.tool,
          installed: externalToolPresent(config, t.exe),
        })),
        note:
          "From ficool2's tools page (https://ficool2.github.io/HammerPlusPlus-Website/" +
          "tools.html). Put the .exe in the directory above, or set externalToolsDir.",
      },
      backend: {
        kind: config.backend,
        nativeCompiler: config.backend === "native" ? join(binDir, "vbsp.exe") : null,
        nativeCompilerPresent:
          config.backend === "native" && existsSync(join(binDir, "vbsp.exe")),
        winePrefix: config.winePrefix,
        wineVersion: wine?.code === 0 ? wine.stdout.trim() : null,
        protonPath: config.protonPath ?? null,
      },
      sidecar,
      guardedToolsAllowlisted: config.toolAllowlist,
      note:
        "This server works on files and compiler processes. NAV generation, Director behavior, " +
        "bots and playability require a separate check inside Left 4 Dead 2. It never touches " +
        "srcds/garrysmod/data/gmod_mcp/.",
    };
  },
});

export const healthTools = [health];
