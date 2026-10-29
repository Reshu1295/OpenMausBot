import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as procs from "../procs.ts";
import { recordEvents } from "../testing/events.ts";
import { CLAUDE_ACCOUNT_ENV_KEYS, ClaudeDriver, readClaudeAuthSettings } from "./claude.ts";
import { MuseCodeDriver } from "./muse-code.ts";

const cli = fileURLToPath(new URL("../testing/fake-claude-cli.ts", import.meta.url));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("offline fixture", { status: 503 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["ANTHROPIC_API_KEY", "anthropic_api_key", "Anthropic_Api_Key"])("preserves explicit Claude credential %s", async (key) => {
  for (const alias of ["ANTHROPIC_API_KEY", "anthropic_api_key", "Anthropic_Api_Key"]) vi.stubEnv(alias, "inherited-key");
  const spawned = vi.spyOn(procs, "spawnCli");
  const instance = await ClaudeDriver.create({
    instanceId: "fixture-claude", displayName: "Fixture", enabled: true,
    environment: { [key]: "explicit-own-key" }, config: ClaudeDriver.decodeConfig({ cli }),
  });
  const recorder = recordEvents(instance.adapter);
  try {
    await instance.adapter.sendTurn({ threadId: "fixture", text: "hi" });
    await recorder.until(event => event.type === "turn.completed");
    const launches = spawned.mock.calls.filter(call => call[3] === "bot");
    expect(launches.length).toBeGreaterThan(0);
    for (const call of launches) {
      expect(Object.fromEntries(Object.entries(call[2].env ?? {}).filter(([name]) => name.toUpperCase() === "ANTHROPIC_API_KEY")))
        .toEqual({ [key]: "explicit-own-key" });
    }
  } finally {
    recorder.stop();
    await instance.dispose();
  }
});

it.each(["META_API_KEY", "meta_api_key", "Meta_Api_Key"])("preserves explicit Muse credential %s", async (key) => {
  for (const alias of ["META_API_KEY", "meta_api_key", "Meta_Api_Key"]) vi.stubEnv(alias, "inherited-key");
  const executed = vi.spyOn(procs, "execCli").mockImplementation((_cli, _args, _opts, callback) => callback(null, "1.4.6"));
  const instance = await MuseCodeDriver.create({
    instanceId: "fixture-muse", displayName: "Fixture", enabled: true,
    environment: { [key]: "explicit-own-key" }, config: MuseCodeDriver.decodeConfig({ cli: "unused-fixture" }),
  });
  try {
    await instance.snapshot();
    expect(executed.mock.calls.length).toBeGreaterThan(0);
    for (const call of executed.mock.calls) {
      expect(Object.fromEntries(Object.entries(call[2].env ?? {}).filter(([name]) => name.toUpperCase() === "META_API_KEY")))
        .toEqual({ [key]: "explicit-own-key" });
    }
  } finally {
    await instance.dispose();
  }
});

const accountEnvironments: Record<string, string>[] = [
  {
    anthropic_api_key: "explicit-key", anthropic_auth_token: "explicit-token",
    anthropic_base_url: "http://127.0.0.1:9", anthropic_custom_headers: "x-fixture: explicit",
    claude_code_use_bedrock: "0", claude_code_use_vertex: "0", claude_code_use_foundry: "0",
  },
  {
    Anthropic_Api_Key: "explicit-key", Anthropic_Auth_Token: "explicit-token",
    Anthropic_Base_Url: "http://127.0.0.1:9", Anthropic_Custom_Headers: "x-fixture: explicit",
    Claude_Code_Use_Bedrock: "0", Claude_Code_Use_Vertex: "0", Claude_Code_Use_Foundry: "0",
  },
];

it.each(accountEnvironments)("preserves named Claude account entries and excludes OAuth and file descriptors (%j)", async (explicit) => {
  for (const key of CLAUDE_ACCOUNT_ENV_KEYS) {
    vi.stubEnv(key, "inherited-account");
    vi.stubEnv(key.toLowerCase(), "inherited-account");
  }
  const configDir = join(homedir(), "fixture-account");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "settings.json"), JSON.stringify({
    apiKeyHelper: "must-not-run", env: { ANTHROPIC_API_KEY: "disk-key", ANTHROPIC_BASE_URL: "https://disk.invalid" },
  }));
  const excluded = Object.fromEntries(CLAUDE_ACCOUNT_ENV_KEYS
    .filter(key => key.startsWith("CLAUDE_CODE_OAUTH_") || key.endsWith("_FILE_DESCRIPTOR"))
    .flatMap(key => [[key, "explicit-excluded"], [key.toLowerCase(), "explicit-excluded"]]));
  const spawned = vi.spyOn(procs, "spawnCli");
  const instance = await ClaudeDriver.create({
    instanceId: "fixture-account", displayName: "Fixture", enabled: true,
    environment: { ...explicit, ...excluded }, config: ClaudeDriver.decodeConfig({ cli, configDir }),
  });
  const recorder = recordEvents(instance.adapter);
  try {
    await instance.adapter.sendTurn({ threadId: "fixture-account", text: "hi" });
    await recorder.until(event => event.type === "turn.completed");
    const launches = spawned.mock.calls.filter(call => call[3] === "bot");
    expect(launches.length).toBeGreaterThan(0);
    for (const call of launches) {
      const seen = Object.fromEntries(Object.entries(call[2].env ?? {})
        .filter(([key]) => CLAUDE_ACCOUNT_ENV_KEYS.some(name => name === key.toUpperCase())));
      expect(seen).toEqual(explicit);
    }
  } finally {
    recorder.stop();
    await instance.dispose();
  }
});

it.each(["anthropic_api_key", "Anthropic_Api_Key"])("prefers an explicit Claude credential %s over account settings", (key) => {
  const configDir = join(homedir(), "fixture-settings");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "settings.json"), JSON.stringify({
    apiKeyHelper: "must-not-run", env: { ANTHROPIC_API_KEY: "disk-key" },
  }));
  expect(readClaudeAuthSettings({ CLAUDE_CONFIG_DIR: configDir }, { [key]: "explicit-key" })).toEqual({});
});
