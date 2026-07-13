# Repository Guidelines

## Project Structure & Module Organization

Yakit is an Electron application with two renderer projects. Electron main-process code and IPC handlers live in
`app/main/`. The primary React/TypeScript UI is under `app/renderer/src/main/src/`; its production output is written to
`app/renderer/pages/main/`. The Vite-based engine startup UI is under `app/renderer/engine-link-startup/src/` and builds
to `app/renderer/engine-link-startup/dist/`. Protocol definitions are in `app/protos/`, application assets in
`app/assets/`, packaging configuration in `packageScript/`, and maintenance utilities in `scripts/` and `cli/`.

Keep tests beside the code they cover in `__test__/` directories. Treat `app/renderer/electron/`, `release/`, `build/`,
and most files in `bins/` as generated or packaged artifacts unless a task specifically targets them.

## Code Intelligence with CodeGraph

This repository has a local CodeGraph index in `.codegraph/`; the directory is intentionally ignored by Git. Use the
CLI from the repository root for symbol-aware investigation. Check `codegraph status .` before relying on results and
use `codegraph sync .` after source changes. Reserve `codegraph index .` for a missing or invalid index because it
rebuilds the full database.

- `codegraph files --filter app/main --max-depth 3` displays an indexed module tree with language and symbol metadata.
- `codegraph query "pickAxiosErrorCore" --kind function` finds symbols; add `--json` for machine-readable output.
- `codegraph explore ai-agent --max-files 8` collects relevant symbols, source excerpts, and call paths for a topic.
- `codegraph node pickAxiosErrorCore` shows one symbol with its source, callers, and callees.
- `codegraph node --file app/main/handlers/auxWindowManager/AuxWindowManager.js --symbols-only` maps a file and its
  dependents. Use `--offset` and `--limit` when only a source range is needed.
- `codegraph callers <symbol>` and `codegraph callees <symbol>` inspect incoming and outgoing calls separately.
- `codegraph impact <symbol> --depth 3` estimates the transitive code affected by a planned symbol change.
- `git diff --name-only | codegraph affected --stdin --quiet` selects indexed tests related to current source changes.

Use CodeGraph before cross-module edits to establish dependencies and likely test scope. Use `rg` for literal strings,
configuration keys, assets, generated files, and other content that has no symbol graph. An index is supporting
evidence: confirm decisive definitions and call sites in the current source, especially after rebases, generated output
changes, or parser warnings.

## Prerequisites and Local Development

Use Node.js 18 or later and Yarn 1.x; CI currently uses Node.js 22. Install all three dependency sets before building:

```bash
yarn
yarn install-render
yarn install-link-render
```

`yarn dev` starts the primary renderer on port 3000 and then launches Electron. To work on both renderer projects,
start `yarn start-renders` and `yarn start-electron` in separate terminals. Variant-specific dual-renderer commands are
`start-renders-enterprise`, `start-renders-simple-enterprise`, `start-renders-irify`,
`start-renders-irify-enterprise`, and `start-renders-memfit`.

## Renderer Build Matrix

Build the renderer pair that matches the package variant. Commands containing `test` enable developer tools; they do
not execute tests.

| Variant | Production renderers | Developer-tools renderers |
| --- | --- | --- |
| Yakit Community (CE) | `yarn build-renders` | `yarn build-test-renders` |
| EnpriTrace Enterprise (EE) | `yarn build-renders-enterprise` | `yarn build-renders-test-enterprise` |
| EE no-license | `yarn build-renders-enterprise-no-license` | `yarn build-renders-test-enterprise-no-license` |
| EnpriTraceAgent (SE) | `yarn build-renders-simple-enterprise` | `yarn build-renders-test-simple-enterprise` |
| IRify | `yarn build-renders-irify` | `yarn build-renders-test-irify` |
| IRifyEnpriTrace | `yarn build-renders-irify-enterprise` | `yarn build-renders-test-irify-enterprise` |
| Memfit AI | `yarn build-renders-memfit` | `yarn build-renders-test-memfit` |

`yarn build-render-breachtrace` builds only the primary BreachTrace renderer. The repository has no matching startup
renderer or installer command, so do not present it as a complete distributable variant.

## Packaging Commands

Packaging does not rebuild the renderers. Run the matching renderer build first, then select one installer command:

| Variant | Windows | macOS | Linux |
| --- | --- | --- | --- |
| CE | `yarn pack-win` | `yarn pack-mac` | `yarn pack-linux` |
| EE | `yarn pack-win-ee` | `yarn pack-mac-ee` | `yarn pack-linux-ee` |
| SE | `yarn pack-win-se` | `yarn pack-mac-se` | `yarn pack-linux-se` |
| IRify | `yarn pack-win-irify` | `yarn pack-mac-irify` | `yarn pack-linux-irify` |
| IRify EE | `yarn pack-win-irify-ee` | `yarn pack-mac-irify-ee` | `yarn pack-linux-irify-ee` |
| Memfit | `yarn pack-win-memfit` | `yarn pack-mac-memfit` | `yarn pack-linux-memfit` |

Append `-legacy` to any package command for the legacy Electron/system-mode package, such as
`yarn pack-win-ee-legacy`. Normal macOS commands enable signing when the required certificate environment variables are
available; Windows and Linux commands disable signing. Installers are written to `release/` and require the expected
engine archives and supporting payloads in `bins/`.

There is no separate no-license packaging script. The license behavior is embedded during the EE renderer build; reuse
the EE packaging target afterward:

```bash
yarn build-renders-enterprise-no-license
yarn pack-win-ee
```

Replace the second command with `yarn pack-mac-ee` or `yarn pack-linux-ee` for another operating system. Use the
corresponding `-legacy` package command when required. Do not rebuild the standard EE renderer between these commands.

## Coding Style & Naming Conventions

Prettier and `.editorconfig` define UTF-8, LF endings, two-space indentation, 120-character lines, no semicolons, single
quotes, and trailing commas. Husky formats staged JavaScript, TypeScript, JSON, CSS, SCSS, and Markdown files. React
components and types use `PascalCase`; functions and variables use `camelCase`; hooks begin with `use`; constants may
use `UPPER_SNAKE_CASE`. Keep Electron behavior in `app/main/` and UI behavior in the appropriate renderer.

## Testing and Local Verification

Vitest uses `jsdom` and `app/renderer/src/main/src/setupTests.ts`. Name tests `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or
`*.spec.tsx` inside `__test__/`. Cover normal behavior, boundary inputs, and failure handling. Before opening a pull
request, run the checks relevant to the change:

```bash
yarn test:vitest --run
yarn ci:eslint
yarn ci:tsc
yarn i18n:check
yarn ci:media-size
```

No numeric coverage threshold is enforced, but behavior changes should include regression coverage. Also build every
affected product variant; a successful CE build does not validate EE, IRify, or Memfit environment branches.

## Branch Workflow

Use `qsh` as the mandatory working and push branch for all ongoing repository changes. Before editing, committing,
pulling, or pushing, run `git branch --show-current` and require the result to be `qsh`; otherwise use `git switch qsh`.
Publish the first local commit with `git push -u origin qsh`, then use `git push` for later updates. Do not commit or push
directly to `master`. Keep `master` as the pull request target, and switch away from `qsh` only when the user explicitly
requests another branch.

## Commit & Pull Request Guidelines

Recent history favors short, imperative prefixes such as `feat:`, `fix:`, `pref:`, and `style:`. Keep commits focused
and avoid mixing generated artifacts with source changes. Pull requests target `master` and should explain user-visible
effects, list affected variants, link related issues, and include screenshots for UI changes. Report the exact local
checks and variant builds performed.

## 人言需求文档

`docs/renyan/` 是人言需求基线、需求原文、证据映射与验证结论的权威目录。需求编号采用稳定的
`RY-F-NNN` 与 `RY-NF-NNN` 格式；已有编号不得复用或静默改写，需求变更必须保留来源、变更原因和
对应基线。

需求证据状态限定为“充分静态证据”“部分静态证据”“未发现直接证据”“待动态验证”“待外部材料”和
“存在冲突风险”。状态只描述当前基线的证据强度，不等同于采购验收、生产验证或合规结论。

需求源、源码证据或状态发生变化时，必须同步维护目录索引、基线说明、需求追踪表和验证报告。所有相关
修改、提交与推送均遵循 `qsh` 分支规则，不得借由需求文档工作修改或推送 `master`。

## Agent-Specific Behavioral Guidelines

The following block is intentionally preserved verbatim. Do not edit, reformat, translate, or reorder it.

<!-- prettier-ignore-start -->
<!-- BEGIN IMMUTABLE BEHAVIORAL GUIDELINES -->
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.
Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.
Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
Before implementing:
State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
Surgical Changes
Touch only what you must. Clean up only your own mess.
When editing existing code:
Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:
Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.
Goal-Driven Execution
Define success criteria. Loop until verified.
Transform tasks into verifiable goals:
"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
[Step] → verify: [check]
[Step] → verify: [check]
[Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
<!-- END IMMUTABLE BEHAVIORAL GUIDELINES -->
<!-- prettier-ignore-end -->
