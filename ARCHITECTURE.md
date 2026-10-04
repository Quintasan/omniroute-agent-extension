# Architecture

## Overview

One extension, two hosts. `shared.ts` holds all logic; `pi.ts` and `omp.ts` are thin entrypoints that call `createOmniExtension(pi, { homeEnvVar, defaultHome })`.

```text
Host CLI
  -> loads extension from package.json (pi.extensions / omp.extensions)
  -> pi.ts / omp.ts -> createOmniExtension()
  -> registers /omni command, omni provider, agent tools
  -> user selects models with /model
  -> every request streams through the host's openai-completions handler
```

There is no prompt-emulation layer. Commit `7620a2d` removed it; all models use the host's built-in OpenAI-compatible provider.

## Data Flow: Setup

```text
/omni setup
  -> ask user for OmniRoute URL
  -> ask user for API key
  -> verify URL with authenticated GET /v1/models
  -> write <agent-home>/omniroute-agent-extension/config.json
  -> sync models and register/refresh the omni provider
```

## Data Flow: Sync

```text
/omni sync  (or omniroute_sync tool)
  -> GET {serverUrl}/v1/models
  -> filter to chat models (isPiChatModel)
  -> map input modalities, context window, max tokens, reasoning
  -> map pricing -> cost via normalizeCost()
  -> dedupe by id, sort by owned_by then id, drop owned_by
  -> write providers.omni.models in <agent-home>/models.json
  -> pi.registerProvider(omni, ...)
  -> refresh host model registry
```

## Data Flow: Request

```text
Host agent
  -> provider "omni", api "openai-completions"
  -> host built-in OpenAI-compatible handler
  -> SSE stream to {serverUrl}/v1/chat/completions
  -> native tool_calls
  -> host executes tools
```

No middleware sits between the host and OmniRoute, so streaming and tool calls are native.

## Data Flow: Load (offline)

```text
extension load
  -> reloadProviderFromModelsJson()
  -> read providers[providerName] from models.json
  -> force api to openai-completions; rewrite legacy api ids
  -> zero-fill partial cost entries
  -> register provider (no network call)
```

## Cost Mapping

OmniRoute returns per-model `pricing` on `/v1/models` in USD per million tokens. `normalizeCost()` maps it to Pi's `cost`:

| OmniRoute | Pi |
|---|---|
| `input` | `cost.input` |
| `output` | `cost.output` |
| `cached` | `cost.cacheRead` |
| `cache_creation` | `cost.cacheWrite` |

Missing fields default to 0; models without `pricing` are zero cost. Synthetic auto models are unpriced. Pi uses these values for session cost in the footer and `/session`.

## Health and Connection Log

- `checkHealth()` probes `GET /v1/models`, retries once to absorb cold starts, and runs on `session_start` and every 60s.
- Failures and slow (>1s) requests are appended as JSON lines to `<agent-home>/omniroute-agent-extension/connection.log` (capped at 256 KiB / 1000 lines). Logging never throws into the caller.

## API Key Handling

`/omni setup` asks for the API key before testing `/v1/models` because protected OmniRoute deployments can require Authorization even for model listing. The key may be blank for local/public deployments. Provider registration substitutes a harmless dummy value (`omniroute-public`) when the saved key is empty; real requests use the saved key when present.

## Extension Boundaries

This repo does not implement OmniRoute itself. It only:

- calls OmniRoute `/v1/models`
- routes chat completions through the host's built-in `openai-completions` provider
- stores config in `config.json` and models in `models.json`
- registers the host command, provider, and agent tools
