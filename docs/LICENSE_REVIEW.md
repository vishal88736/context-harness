# Source license and attribution review

Reviewed imported revision: `e31136bdbdb43e934d8bbd81e75a2065a2625699`.

OpenCode's root `LICENSE`, `packages/ui/LICENSE`, and `packages/http-recorder/LICENSE` contain the MIT license with `Copyright (c) 2025 opencode`. The MIT grant allows copying, modification, redistribution and commercial use, conditional on retaining the copyright and permission notice in copies or substantial portions. Keep the complete license, including its warranty/liability disclaimer, in source and distributions. Independent Git history and a separately created GitHub repository do not change those obligations.

The root license remains byte-for-byte identical to the imported archive. New project branding is not a transfer of authorship or trademark rights. The README explicitly identifies OpenCode as the upstream implementation and records the exact source revision. Copyright headers and legal notices have not been renamed.

## Bundled notices preserved

| Source                                                                                 | License / notices                                                     | Redistribution requirements                                                                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root, UI and HTTP-recorder LICENSE files                                               | MIT                                                                   | Carry copyright, permission notice and disclaimer                                                                                                     |
| `script/oxlint/anti-slop/vendor/eslint-stylistic/LICENSE`                              | MIT; OpenJS Foundation and ESLint Stylistic contributors              | Keep their separate copyright and permission notices                                                                                                  |
| `packages/codemode/test/LICENSE.wpt`                                                   | BSD 3-Clause; web-platform-tests contributors                         | Retain source notices; reproduce notices in binary documentation/materials; no contributor endorsement without permission                             |
| `packages/codemode/test/LICENSE.test262`                                               | BSD 3-Clause; Ecma International                                      | Same notice/disclaimer/non-endorsement requirements; retain the additional third-party/patent-rights statement                                        |
| `packages/app/src/settings/about/notices/apache-2.0.txt` and `betteroffice-notice.txt` | Apache 2.0; BetterOffice / OpenOOXML and eigenpal editor              | Include the license and applicable NOTICE attribution, retain notices, identify modifications when modifying Apache-covered files; no trademark grant |
| `packages/app/src/settings/about/notices/fonts.ts` and `fonts/OFL-1.1.txt`             | SIL Open Font License 1.1 with font copyright and Reserved Font Names | Include license/copyright; preserve font license; respect Reserved Font Names for modified fonts; do not sell fonts by themselves                     |
| `packages/app/src/settings/about/notices/crates.ts`                                    | Rust/wasm dependency copyrights, full license texts and expressions   | Preserve the included package-specific notices and all applicable conjunctive license terms; do not collapse the inventory to the root MIT license    |
| `packages/desktop/src/renderer/window/zoom.ts`                                         | Tauri copyright and MIT / Apache 2.0 SPDX notices                     | Preserve both upstream notices and the applicable license text                                                                                        |

The existing About / open-source notices UI and its complete notice/license assets remain included. The crate inventory contains MIT, Apache 2.0, BSD 2-Clause/3-Clause, Zlib and Unicode 3.0 terms, with alternative-license expressions including Boost Software License, Unlicense and 0BSD. Where a license expression uses AND, the combined obligations remain; an OR expression offers alternatives. Existing full texts and package copyrights are retained rather than replaced by an abbreviated summary.

SIL OFL forbids claiming endorsement by font authors and imposes additional conditions on modified fonts. Zlib notices prohibit misrepresenting origin, require marking altered versions, and must not be removed. Unicode data notices retain copyright/permission and restrict promotional use of copyright-holder names. BSD clauses likewise restrict endorsement. This project does not modify those vendored third-party assets.

Runtime/build dependencies remain declared and pinned in package manifests and `bun.lock`; installed `node_modules` is excluded from Git. Dependency notices bundled into a distributable remain subject to their own licenses. This source review is not a claim that every possible native/package release artifact has been audited: release packaging must carry the full notices for the actual dependencies it ships, using the retained inventories and dependency license files.

## Independent repository

The source was downloaded as an archive, so it contains no upstream `.git` directory or commit history. A fresh repository was initialized on `dev` under `context-harness`. The owner approved creating and pushing the public repository `vishal88736/context-harness`. GitHub Fork has not been used. GitHub's repository API confirms `fork: false`, `parent: null`, and `source: null`. Archived upstream workflows cannot execute from `.github/workflows` or publish upstream artifacts.

Publishing approval names the owner, repository and public visibility. The initial import is reviewed for credentials/private data before pushing. Preserve these notices in future source and binary distributions regardless of repository identity.
