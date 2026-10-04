# AGENTS.md

Instructions for AI agents working in this repository.

## Start Here

Before editing, read:

1. `AI.md` — fast project handoff and key function map.
2. `ARCHITECTURE.md` — extension data flow and routing.
3. `README.md` — user-facing behavior and commands.
4. `CONTRIBUTING.md` — local checks and contribution rules.

## Must-Do Documentation Rule

If you change source behavior, update docs in the same change.

Use this mapping:

| Change type | Docs to update |
|---|---|
| User-visible command/setup/model behavior | `README.md` |
| Provider flow, tool routing, sync/cost mapping | `ARCHITECTURE.md` |
| File layout, key function names, scan paths, pitfalls | `AI.md` |
| Dev workflow, tests, contribution process | `CONTRIBUTING.md` |
| Package scripts/deps | `README.md` Development section and `CONTRIBUTING.md` if relevant |

Do not leave code/docs inconsistent.

## Core UX Constraint

Keep model switching normal:

```text
/model <model-id>
```

The provider is always:

```text
omni
```

Do not introduce duplicate providers unless the user explicitly asks.

## Routing Constraint

All synced models register with:

```ts
api: "openai-completions"
```

Requests route through the host's built-in OpenAI-compatible handler. There is no prompt-emulation layer (removed in commit `7620a2d`); do not reintroduce one without an explicit request.

Do not rely only on the host runtime `Model` for custom metadata. The host strips unknown fields; use raw `models.json` when needed.

## Test Before Reporting Done

Run:

```bash
npm run typecheck
npm test
npm run smoke
```

If tests cannot run, report the exact command and failure.

## Edit Guidance

- Prefer small targeted edits.
- Keep comments on non-obvious functions.
- Preserve `/omni setup`, `/omni sync`, `/omni dashboard` behavior unless the user asks to change it.
- Keep `/omni sync` non-destructive: it only replaces `config.providers.omni.models`.
- If adding files, update the `AI.md` file map.

## Important Files

| File | Why important |
|---|---|
| `shared.ts` | Extension implementation. |
| `pi.ts`, `omp.ts` | Host entrypoints; call `createOmniExtension`. |
| `AI.md` | AI scan guide; update when structure/function map changes. |
| `ARCHITECTURE.md` | Data flow and routing docs. |
| `README.md` | User-facing documentation. |
| `CONTRIBUTING.md` | Dev/test workflow. |
| `package.json` | Host extension metadata and scripts. |
