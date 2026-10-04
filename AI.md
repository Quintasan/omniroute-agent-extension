# AI Handoff Guide

This file is the first stop for AI agents. Read this before scanning the repo.

## Repository Purpose

`omniroute-agent-extension` is a Pi Coding Agent (`pi`) and Oh My Pi (`omp`) extension for OmniRoute.

It does three jobs:

1. `/omni setup` saves the OmniRoute URL/API key into the extension config and verifies the server.
2. `/omni sync` fetches OmniRoute `/v1/models` and syncs them into the host's `/model` picker with context window, max tokens, reasoning, vision, and per-model cost.
3. It registers the `omni` provider so every model routes through the host's built-in `openai-completions` handler — native SSE streaming and native `tool_calls`, no middleware.

## Files

| Path | Purpose |
|---|---|
| `shared.ts` | Entire extension implementation. Commands, sync, provider registration, health checks, connection log. |
| `pi.ts` | Pi entrypoint; calls `createOmniExtension` with `PI_HOME` / `~/.pi/agent`. |
| `omp.ts` | OMP entrypoint; calls `createOmniExtension` with `OMP_HOME` / `~/.omp/agent`. |
| `test/shared.test.ts` | Node test suite. |
| `README.md` | User-facing install/setup/usage docs. |
| `package.json` | Host extension metadata, scripts, dev deps. |
| `package-lock.json` | Locked npm dependency tree. |
| `tsconfig.json` | NodeNext TS config. |
| `AGENTS.md` | Mandatory instructions for AI agents editing this repo. |
| `ARCHITECTURE.md` | Data flow and routing architecture. |
| `CONTRIBUTING.md` | Dev workflow and contribution rules. |
| `LICENSE` | MIT. |

## Key Concepts

### Provider name

The provider is always `omni`. Users switch models normally:

```text
/model cc/claude-opus-5
/model codex/gpt-5.2
```

Do not create a second provider. A single provider, single `api`, keeps the `/model` workflow unchanged.

### Underlying API

All models register with:

```ts
const PROVIDER_API = "openai-completions";
```

Requests go through the host's built-in OpenAI-compatible handler. There is no prompt-emulation layer (removed in commit `7620a2d`); do not reintroduce it without an explicit request.

### Model mapping

`fetchSyncedModels()` reads `/v1/models` and maps each chat model to a Pi model entry:

- `context_length` / `max_input_tokens` → `contextWindow`
- `max_output_tokens` / `max_tokens` → `maxTokens`
- `input_modalities` / `input` → `input`
- `capabilities.reasoning` / `capabilities.thinking` / `reasoning` → `reasoning`
- `pricing` → `cost` via `normalizeCost()`

`normalizeCost()` maps OmniRoute `pricing` to Pi `cost` in USD per million tokens: `input`→`input`, `output`→`output`, `cached`→`cacheRead`, `cache_creation`→`cacheWrite`. Missing fields default to 0; models without `pricing` are zero cost.

### Auto models

`AUTO_MODELS` (`auto`, `auto/coding`, …) are synthetic entries prepended when the server does not return them. They are unpriced and always first in the picker.

## Important Functions In `shared.ts`

Read in this order:

1. `createOmniExtension()` — factory; wires provider, agent tools, `/omni` command, and session events.
2. `registerOmniProvider()` — syncs and registers the `omni` provider; persists `models.json`.
3. `fetchSyncedModels()` — fetches `/v1/models` and maps to `SyncedModel`.
4. `normalizeCost()` — maps OmniRoute `pricing` to Pi `cost`.
5. `buildProviderModelConfig()` / `buildAutoModel()` — build Pi model entries.
6. `reloadProviderFromModelsJson()` — offline registration from `models.json`; normalizes legacy api ids and zero-fills partial costs.
7. `discoverModels()` — auto models plus synced models.
8. `checkHealth()` — reachability probe; retries once for cold starts.
9. `requestJson()` / `appendConnectionLog()` — HTTP helper and connection log.
10. `runSetup()` / `testChat()` / `showStatus()` / `helpText()` — CLI surfaces.

## Common Change Requests

### Change sync metadata

Update `fetchSyncedModels()` (and `SyncedModel`), `buildProviderModelConfig()`, and `normalizeCost()`. Then update `README.md` if user-visible and `ARCHITECTURE.md`.

### Add a slash subcommand

Add a branch in the `/omni` command handler; update `getArgumentCompletions()`, `helpText()`, and `README.md`.

### Change setup behavior

Update `runSetup()`. Preserve the current order: ask for the API key before testing `/v1/models`, because protected OmniRoute servers may require Authorization for model listing.

## Test Commands

```bash
npm run typecheck
npm test
npm run smoke
```

## Pitfalls

- Pi strips unknown fields from the runtime `Model`; read raw `models.json` when custom metadata is needed.
- `pricing` units are USD per million tokens — do not convert.
- Keep `/omni sync` non-destructive: it only replaces `config.providers.omni.models`.
- `requestJson()` and `checkHealth()` append failures to `connection.log`; keep logging non-fatal (never throw into the caller).
- `tsconfig.json` includes `shared.ts`, `omp.ts`, `pi.ts`, `test/**/*.ts`.
