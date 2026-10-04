# Contributing

## Quick Start

```bash
npm install
npm run typecheck
npm test
npm run smoke
```

## Development Scripts

| Command | Purpose |
|---|---|
| `npm run typecheck` | Type-check both host entrypoints, shared code, and tests with NodeNext settings. |
| `npm test` | Run the focused Node test suite. |
| `npm run smoke` | Import both Pi and OMP entrypoints and verify they load. |

## Local Testing

Link the checkout into either host:

```bash
pi install /absolute/path/to/omniroute-agent-extension
omp plugin link /absolute/path/to/omniroute-agent-extension
```

Then in Pi or OMP:

```text
/omni setup
/omni sync
/model cgpt-web/gpt-5.4-pro
```

## Before Opening a PR

Run:

```bash
npm run typecheck
npm test
npm run smoke
```

Check working tree:

```bash
git status --short
git diff --stat
```

## Documentation Rules

If changing user-visible behavior, update `README.md`.

If changing architecture or core data flow, update `ARCHITECTURE.md`.

If changing function names or scan paths, update `AI.md` so future AI agents do not waste tokens rediscovering the repo.

## Coding Rules

- Keep shared logic in `shared.ts`; host-specific code stays in `pi.ts` / `omp.ts`.
- Add short comments for non-obvious functions.
- Preserve `/model` UX; do not add duplicate providers.
- Keep `omni` as the provider name and `openai-completions` as the api.
- Avoid destructive behavior in `/omni sync`; it should only replace `config.providers.omni.models`.

## Testing Checklist

For model sync changes:

- `npm run typecheck` and `npm test` pass.
- `/omni setup` saves URL/API key to `config.json`.
- `/omni sync` writes models to `<agent-home>/models.json`.
- Metadata maps correctly: context window, max tokens, reasoning, input modalities.
- `pricing` maps into Pi `cost` (`input`/`output`/`cached`/`cache_creation`); missing fields default to 0.
- Models without `pricing` stay at zero cost.
- `reloadProviderFromModelsJson` normalizes legacy api ids and zero-fills partial costs.

## Commit Style

Use descriptive commit messages. Good examples:

```text
Add OmniRoute model pricing to Pi cost
Document model sync cost mapping
Add connection log for failed requests
```
