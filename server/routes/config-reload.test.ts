import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import vm from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { changedInstanceIds, engineLaunches, loadConfig, saveConfig, syncCredentialEnv } from "../config.ts";
import { EventBus } from "../harness/bus.ts";
import { reloadProviderInstances } from "../harness/provider-reload.ts";
import { ProviderRegistry } from "../harness/registry.ts";
import { makeFakeDriver } from "../testing/fake-driver.ts";
import { createConfigRoutes, type ConfigRouteDeps } from "./config.ts";

const source = ts.createSourceFile("index.ts", readFileSync(new URL("../index.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest);
const reload = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "reloadProviders");
if (!reload) throw new Error("Provider reload function not found");
const reloadCode = ts.transpileModule(reload.getText(source), { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText;

it.each(["PATCH", "PUT"])("%s /api/config retries identical saved settings until the retiring owner can be replaced", async (method) => {
  syncCredentialEnv({ openaiCompat: { key: "synthetic-old-key" } });
  saveConfig({ openaiCompat: { key: "synthetic-old-key" } });
  const cfg = loadConfig();
  const providerConfigs = () => ({
    compat: { driver: "openai-compat", environment: { OPENAI_COMPAT_API_KEY: cfg.openaiCompat!.key! } },
  });
  const fake = makeFakeDriver({ kind: "openai-compat" });
  const registry = new ProviderRegistry([fake.driver]);
  await registry.load(providerConfigs());
  const old = registry.get("compat")!;
  const blocked = new Error("synthetic teardown blocked: old CLI still running");
  const dispose = vi.spyOn(old, "dispose").mockRejectedValue(blocked);
  const create = vi.spyOn(fake.driver, "create");
  const bus = new EventBus();
  bus.attach([old]);
  const providerInstancesChanging = new Set<string>();
  const context = vm.createContext({
    providerConfigs, registry, bus, reloadProviderInstances, changedInstanceIds, engineLaunches,
    providerInstancesChanging, providerFleetReloading: false,
    store: { bots: [] }, groupSpeakers: new Map(),
    decorateHostedProvider: undefined,
    revokeEngineCapabilities() {}, providerAuthSessions: { clearInstance() {} }, drainQueuedSends() {},
  });
  vm.runInContext(reloadCode, context);
  let busy = false;
  let attempts = 0;
  const route = createConfigRoutes({
    cfg, registry, store: { bots: [] }, hostedModels: false, cloudHome: false,
    lendingEnabled: () => true, providerConfigs,
    providerConfigBusy: { get: () => busy, set: (value: boolean) => { busy = value; } },
    computerProviderConfigTransitions: new Set(),
    configStatus: () => ({ saved: true }), configForAccess: (status: unknown) => status,
    broadcast() {}, revokeEngineCapabilities() {},
    hasPendingProviderReload: () => registry.retiringIds().length > 0,
    reloadProviders: async (before: Record<string, unknown>) => {
      attempts++;
      await context.reloadProviders(before);
    },
  } as unknown as ConfigRouteDeps);
  const send = async () => {
    let response: { status: number; body: unknown } | undefined;
    try {
      await route({
        method, path: "/api/config", url: new URL("http://fixture/api/config"),
        req: { headers: {} } as IncomingMessage, res: {} as ServerResponse,
        auth: { kind: "loopback", scopes: ["admin"] },
        readBody: async () => ({ openaiCompat: { key: "synthetic-new-key" } }),
        json: (_res, status, body) => { response = { status, body }; },
      });
      return { response, error: undefined };
    } catch (error) {
      return { response, error };
    }
  };
  try {
    expect(await send()).toEqual({ response: undefined, error: blocked });
    expect(loadConfig().openaiCompat?.key).toBe("synthetic-new-key");
    expect(registry.get("compat")).toBe(old);
    expect(registry.retiringIds()).toEqual(["compat"]);
    expect([...providerInstancesChanging]).toEqual(["compat"]);
    expect(busy).toBe(false);

    expect.soft(await send()).toEqual({ response: undefined, error: blocked });
    expect.soft(attempts).toBe(2);
    expect(registry.get("compat")).toBe(old);
    expect(registry.retiringIds()).toEqual(["compat"]);
    expect([...providerInstancesChanging]).toEqual(["compat"]);
    expect(create).not.toHaveBeenCalled();
    expect(busy).toBe(false);

    dispose.mockResolvedValue();
    expect(await send()).toEqual({ response: { status: 200, body: { saved: true } }, error: undefined });
    expect.soft(attempts).toBe(3);
    expect.soft(registry.get("compat")).not.toBe(old);
    expect.soft(registry.retiringIds()).toEqual([]);
    expect.soft([...providerInstancesChanging]).toEqual([]);
    expect.soft(create).toHaveBeenCalledTimes(1);
    expect.soft(create.mock.calls[0]?.[0].environment.OPENAI_COMPAT_API_KEY).toBe("synthetic-new-key");
    expect(busy).toBe(false);

    expect(await send()).toEqual({ response: { status: 200, body: { saved: true } }, error: undefined });
    expect.soft(attempts).toBe(3);
    expect.soft(create).toHaveBeenCalledTimes(1);
  } finally {
    dispose.mockResolvedValue();
    bus.detach("compat");
    await registry.disposeAll();
    vi.restoreAllMocks();
  }
});
