# Content search and VMF batches

Measured on 2026-10-13 with the local Windows L4D2 installation, native Node and
the pinned srctools 2.7.0 sidecar. These are observations on this machine, not latency
targets. No game process or editor automation was used.

## Stage 4: search costs

The baseline Python harness timed mounting, the filtered walk, material details and
JSON encoding separately. A broad material query (`pattern: "*"`, `limit: 100`)
matched 8,179 materials. Its first search took 3,006.15 ms; a subsequent search in
the same harness took 1,167.94 ms: mounting 107.56 ms, walking 1,058.62 ms and JSON
encoding 0.06 ms. Bare Python subprocess launches took 22.29–27.24 ms.

The traversal dominated, so a disposable name index was justified. Each production
call still launches a fresh Python process. The TypeScript caller writes the proposed
index through `writeGuarded`, using a guarded sibling temporary file and atomic rename.
The index lives under `stateDir`, keyed by profile and the real game directory.
Its signature includes gameinfo metadata, ordered mount identities, VPK directory and
chunk metadata, and directory metadata throughout loose materials/model trees.
Unknown mount types or inaccessible metadata disable the index. Corrupt indexes are
rebuilt. Details are not cached: changing an existing VMT is visible on the next
details request even when the name index remains valid.

The benchmark records tool duration separately from phase timings. `processMs`
includes launching Python, its work, transport and parsing the JSON reply.
`serializationMs` measures Python's encoding before writing stdout, reported through
stderr telemetry. On rebuild the internal sidecar reply includes the proposed index
(683,353 bytes in this run); the MCP handler removes it before returning the bounded
page. An index hit's internal reply was 9,227 bytes for this query.

| Query | Tool duration | Outcome |
|---|---:|---|
| No usable index | 1,330.38 ms | Full walk |
| Explicit rebuild | 1,404.77 ms | Index persisted |
| Repeated names query | 296.94 ms | Index hit |
| Repeated names query | 284.98 ms | Index hit |
| Details for the first 100 | 289.91 ms | Index hit, live VMT reads |
| Next page, offset 100 | 280.61 ms | Index hit |

The second names hit spent 156.21 ms mounting, 36.20 ms checking/loading the index,
0 ms walking, 10.19 ms filtering and 0.07 ms serializing. It was about 4.7 times faster
than the no-index query measured by the same benchmark.

Before and after the changes, three waves of twelve concurrent `health` sidecar calls
produced no warnings and no listener growth. `MaxListenersExceededWarning` was not
reproduced; no listener limits or cleanup behavior were changed.

Reproduce after `corepack pnpm build`:

```powershell
node scripts/benchmark-content.mjs
```

The benchmark refreshes a disposable index; game content is only read. Search responses
expose `offset`, `limit`, `total`, `shown`, `truncated`, `cache` and `timings`.
The audit log adds `content_search` with profile, query, counts, cache status and timings.
`rebuildIndex: true` refreshes explicitly. A write-root refusal disables persistence
while preserving the search.

## Stage 5: existing batches

`write_vmf_solid.solids[]` validates all new brushes through the independent volume
reader before one write. `edit_vmf.ops[]` validates all input and the final parsed
document before one write. Each successful batch has at most one optional backup.
Rejected batches preserve source bytes, mtime and the absence of a new backup.
Both support `dryRun`. Selectors refer to the original document; they do not select
entities added earlier in the same call.

The integration also rejects insertions inside a replaced/removed range, competing
updates to a previously absent key, and material text that could inject KeyValues.
Untouched comments and formatting remain preserved by splicing.

The synthetic benchmark placed 24 boxes in one batch (10.33 ms), then 12 entities in
one batch (4.75 ms). The two calls wrote twice and emitted two `vmf_edit` records.
Those observations do not justify a combined scene tool. Each batch is independently
validated; two separate calls are not one transaction, and VMF writes do not claim
crash/power-loss atomicity.

```powershell
node scripts/benchmark-batches.mjs
```

This benchmark removes its synthetic VMF and backups afterward. It does not compile
the scene. The MCP remains at 78 tools.

## Verification

Build and typecheck passed. The full suite passed 1,027 tests and skipped 83 tests
whose external prerequisites were missing. The 14 new tests ran successfully.

Each new test was deliberately made red and restored, as CONTRIBUTING requires:

| Test coverage | Deliberate failure |
|---|---|
| Stable pages, live details and timings | Disable index hits |
| Nested loose files, gameinfo and rebuilds | Freeze the signature |
| Search with prohibited cache writes | Bypass the index-path guard |
| Archive metadata and unknown mounts | Remove metadata from the signature |
| Profile/install isolation and atomic replacement | Disable atomic persistence |
| Complete brush batch and one backup | Keep only the first brush |
| Invalid last brush leaves source intact | Keep only the first brush |
| Material injection | Disable material validation |
| Complete entity/output batch and one backup | Keep only the first entity operation |
| Invalid last entity leaves source intact | Keep only the first entity operation |
| Remove/insert conflict | Disable insertion overlap rejection |
| Generated-document parse | Disable final parsing |
| Competing new-key updates | Disable the duplicate-key check |
| Dry runs of both writers | Ignore dryRun in the write guard |

L4D2 runtime playability, bot navigation and GUI behavior remain outside these offline
checks. The legacy GMod FGD/assets, large production fixtures and optional external
tools account for the skipped tests.

The next [functional audit plan](../plans/2026-10-13-l4d2-audit-plan.md) checks the
registered MCP contracts and a complete map workflow, using these measurements as
prior evidence. Its coverage matrix is planned coverage, not completed audit results.
