# Validation of the first working implementation

Validated on 2026-10-11 against imported OpenCode revision `e31136bdbdb43e934d8bbd81e75a2065a2625699`, with Bun 1.4.2 and Chromium 147.0.7727.15 on Linux.

## Results

| Check                               | Result                                 | Scope                                                                                                                                           |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline core tests                 | 67 passed                              | Existing message conversion, tool event settlement, and compaction                                                                              |
| Final focused core suite            | 308 passed, 0 failed; 1,445 assertions | Request construction/hooks, main execution loop, generation/preview, tool dependencies, native/summary compaction, retries and cancellation     |
| New browser keeper cases            | 2 passed                               | Context switching, durable metadata round trips, snapshots/restoration, page reload, retained history, phone-sized manual preview/edit/approval |
| Production session-switch benchmark | 5 cases passed before and after        | Cold/warm sessions and existing file-review panel closed/open/resized                                                                           |
| Root lint                           | Passed, 0 errors                       | Existing repository warnings remain                                                                                                             |
| Workspace typecheck                 | 36 of 36 packages passed               | Root Turbo typecheck with sandbox-compatible Astro configuration                                                                                |
| Production web build                | Passed                                 | Existing app build and Vite preview                                                                                                             |
| Backend startup                     | Passed                                 | Live authenticated server listens on port 4096; unauthenticated API requests return 401                                                         |
| Source attribution verification     | Passed                                 | 13 identified license/notice files unchanged; original README and all 28 archived workflows unchanged                                           |
| Independent repository              | Passed                                 | Fresh `dev` history, directly created public repository; GitHub confirms `fork: false`, no `parent` or `source`                                 |

The new core scenarios exercise the real session runner, event bus, storage, and Form services with controlled provider responses. They verify that excluding an old turn removes both its tool calls and results from inference, keeps durable conversation history, and restores the exchange when switching contexts. They also verify a 4,096-token output reservation, summaries at user privilege, zero inference before explicit approval, a separate approval for each autonomous continuation, paired tool results after approval, and cancellation without a provider request. The generation keeper verifies that preview calls invoke no provider and do not mutate durable session state or consume queued input.

The browser cases exercise actual production UI and generated clients against the existing HTTP fixture server. They verify persistence after page reload and explicit manual form answers, including exclusions and a request note. Desktop and 390-pixel-wide screenshots were inspected. Backend process restart was not performed; repository instructions prohibit restarting running app/server processes. Persistence uses the existing durable session metadata path rather than browser-only memory.

## Reproduction

Run from `packages/core`:

```sh
bun test \
  test/session-compaction.test.ts \
  test/session-model-request-hooks.test.ts \
  test/session-native-compaction.test.ts \
  test/session-runner-message.test.ts \
  test/session-runner-tool-events.test.ts \
  test/session-runner.test.ts \
  test/session-step.test.ts \
  test/session-generate.test.ts
```

From `packages/app`, with Playwright's Chromium installed:

```sh
bun x playwright test e2e/regression/timeline-history.spec.ts --grep context --workers 1
bun x playwright test --config e2e/performance/playwright.config.ts \
  e2e/performance/timeline/session-tab-switch-benchmark.spec.ts --repeat-each 1 --workers 1
```

For an already running production preview, set `PLAYWRIGHT_BUILD=1` and `PLAYWRIGHT_BASE_URL` to its URL; this keeps the fixture origin aligned with production client routing. The existing preview process was reused throughout validation.

From the root:

```sh
ASTRO_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME=/tmp/context-harness-config \
  bun run check
```

The initial `bun run check` encountered Astro attempting to write outside the permitted workspace because Turbo stripped the temporary configuration override. Passing through `ASTRO_TELEMETRY_DISABLED` and `XDG_CONFIG_HOME` in `turbo.json` fixes that environment issue while retaining strict environment filtering. Native compaction tests also require local socket access; they pass when run in the permitted local-network execution environment.

The separate, optional `bun x tsgo --noEmit -p e2e/tsconfig.json` check still reports four upstream errors in unchanged terminal/timeline probes and animation-event handlers. No errors remain in the new context UI or edited keeper/helper files. Those inherited files were verified against the pinned source archive.

## Baseline comparison

The existing benchmark uses two 400-message sessions with approximately 3.9 MB of serialized history each. Times below are milliseconds, shown as first correct destination / stable observation. “Review” refers to the existing file-review panel; the new context sidebar is closed for this comparison and is lazily mounted.

| Scenario             |      Baseline | Context Harness |
| -------------------- | ------------: | --------------: |
| Cold, review closed  | 195.5 / 259.3 |   146.2 / 156.8 |
| Cold, review open    | 197.4 / 212.2 |   170.1 / 190.1 |
| Warm, review closed  |   35.8 / 78.7 |     30.9 / 79.9 |
| Warm, review open    |   48.1 / 96.4 |     40.0 / 83.4 |
| Warm, review resized |   48.1 / 96.5 |     51.3 / 96.3 |

Each case has one sample per version. These results establish functional benchmark compatibility and provide a limited regression observation; they do not establish a statistically significant performance change or measure an open sidebar with a large context preview. Automatic mode with the default selection retains baseline message construction, permissions, provider lowering, and compaction behavior, as covered by the existing core tests.

## Remaining validation and release work

- Live paid-provider inference was not exercised. Provider credentials were not added to the source or committed.
- Preflight token usage remains an explicitly labeled serialized-content estimate. Existing provider usage after inference is shown separately; it is not misrepresented as the count of an edited request. Auxiliary requests without an explicit generation cap reserve their catalog output limit.
- Selection is at complete-turn granularity. Protected compaction/native checkpoints remain intact; exclusion does not redact information embedded in a previous summary. Individual file or tool-part redaction requires dependency-aware selection and summary rebuilding.
- Snapshots/settings are session-scoped. They reference history in the durable database; they are not exports of the entire session or cross-session global profiles.
- Native release branding, icons, updater endpoints and publishing automation still require a release pass before distributing binaries.

The owner approved public publication to `vishal88736/context-harness`. The repository was created directly, and GitHub API checks confirm `fork: false`, `parent: null`, and `source: null`. The initial history contains only the independently imported and modified project, with no upstream commits. Commit identity uses a GitHub no-reply address.

Runtime state and test credentials were kept outside the repository. Environment files and common credential/key files are ignored. Git candidates contained no `.env*`, runtime database, private key, `auth.json`, or `credentials.json` files, and no file larger than 90 MB. A credential-pattern scan found only AWS documented example identifiers in two unchanged upstream provider test files. Real credentials were not added to the source.
