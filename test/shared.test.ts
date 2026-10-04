import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOmniExtension } from "../shared.ts";

test("normalizes legacy Pi catalog API identifiers when reloading models.json", async () => {
  const agentHome = mkdtempSync(join(tmpdir(), "omniroute-agent-extension-test-"));
  const envName = "OMNIROUTE_TEST_HOME";
  const previousHome = process.env[envName];
  process.env[envName] = agentHome;

  writeFileSync(
    join(agentHome, "models.json"),
    JSON.stringify({
      providers: {
        omni: {
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "test-key",
          api: "omni-prompt-tools",
          models: [
            { id: "gpt-test", name: "GPT Test", api: "omni-prompt-tools" },
            {
              id: "gpt-partial-cost",
              name: "GPT Partial Cost",
              api: "omni-prompt-tools",
              cost: { input: 1.25 },
            },
          ],
        },
      },
    }),
  );

  const registrations: Array<{ name: string; config: any }> = [];
  const pi = {
    registerProvider(name: string, config: any) {
      registrations.push({ name, config });
    },
    registerTool() {},
    registerCommand() {},
    on() {},
  };

  try {
    await createOmniExtension(pi, { homeEnvVar: envName, defaultHome: "~/.unused" });

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, "omni");
    assert.equal(registrations[0].config.api, "openai-completions");
    assert.equal(registrations[0].config.models[0].api, "openai-completions");
    assert.deepEqual(registrations[0].config.models[0].cost, {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    assert.deepEqual(registrations[0].config.models[1].cost, {
      input: 1.25,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  } finally {
    if (previousHome === undefined) delete process.env[envName];
    else process.env[envName] = previousHome;
    rmSync(agentHome, { recursive: true, force: true });
  }
});

test("health check uses the liveness probe and falls back to /v1/models", async () => {
  const agentHome = mkdtempSync(join(tmpdir(), "omniroute-agent-extension-health-test-"));
  const envName = "OMNIROUTE_TEST_HOME";
  const previousHome = process.env[envName];
  process.env[envName] = agentHome;

  const tools = new Map<string, any>();
  const pi = {
    registerProvider() {},
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on() {},
  };

  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  try {
    await createOmniExtension(pi, { homeEnvVar: envName, defaultHome: "~/.unused" });
    const status = tools.get("omniroute_status");
    assert.ok(status, "omniroute_status tool registered");

    // Modern server: the liveness probe answers, so the large model listing is never fetched.
    globalThis.fetch = (async (input: any) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    assert.equal((await status.execute("1", {})).details.ok, true);
    assert.ok(requested.length > 0);
    assert.ok(
      requested.every((url) => url.endsWith("/api/health")),
      `expected only liveness probes, got ${requested.join(", ")}`,
    );

    // Older server: a 404 on the liveness probe falls back to /v1/models.
    requested.length = 0;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/api/health")) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ object: "list", data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    assert.equal((await status.execute("1", {})).details.ok, true);
    assert.ok(
      requested.some((url) => url.endsWith("/v1/models")),
      `expected fallback to /v1/models, got ${requested.join(", ")}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousHome === undefined) delete process.env[envName];
    else process.env[envName] = previousHome;
    rmSync(agentHome, { recursive: true, force: true });
  }
});

test("footer status reports OmniRoute state", async () => {
  const agentHome = mkdtempSync(join(tmpdir(), "omniroute-agent-extension-status-test-"));
  const envName = "OMNIROUTE_TEST_HOME";
  const previousHome = process.env[envName];
  const previousUrl = process.env.OMNIROUTE_URL;
  process.env[envName] = agentHome;
  delete process.env.OMNIROUTE_URL;

  const handlers = new Map<string, any>();
  const pi = {
    registerProvider() {},
    registerTool() {},
    registerCommand() {},
    on(event: string, handler: any) {
      handlers.set(event, handler);
    },
  };

  const originalFetch = globalThis.fetch;
  const statuses: Array<string | undefined> = [];
  const ctx = {
    ui: {
      setStatus(_key: string, text?: string) {
        statuses.push(text);
      },
      notify() {},
    },
  };

  try {
    await createOmniExtension(pi, { homeEnvVar: envName, defaultHome: "~/.unused" });
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart, "session_start handler registered");

    // No config file and no OMNIROUTE_URL override.
    await sessionStart({}, ctx);
    assert.equal(statuses.at(-1), "🟠 OmniRoute: unconfigured");

    mkdirSync(join(agentHome, "omniroute-agent-extension"), { recursive: true });
    writeFileSync(
      join(agentHome, "omniroute-agent-extension", "config.json"),
      JSON.stringify({ serverUrl: "http://127.0.0.1:20128", apiKey: "", providerName: "omni" }),
    );

    // Reachable: the liveness probe answers.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    await sessionStart({}, ctx);
    assert.equal(statuses.at(-1), "🟢 OmniRoute: ok");

    // Unreachable: the probe fails and retries once.
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await sessionStart({}, ctx);
    assert.equal(statuses.at(-1), "🔴 OmniRoute: unreachable");

    // Stop the health interval so the test process can exit.
    handlers.get("session_shutdown")?.({}, ctx);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousHome === undefined) delete process.env[envName];
    else process.env[envName] = previousHome;
    if (previousUrl === undefined) delete process.env.OMNIROUTE_URL;
    else process.env.OMNIROUTE_URL = previousUrl;
    rmSync(agentHome, { recursive: true, force: true });
  }
});
