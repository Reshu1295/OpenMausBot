import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { recordEvents } from "../testing/events.ts";
import { CodexDriver } from "./codex.ts";

const cli = fileURLToPath(new URL("../testing/fake-codex-app-server.ts", import.meta.url));
afterEach(() => { vi.unstubAllEnvs(); });

it.each([
  [{ openmausbot_company_api_key: "lower-key" }, "openmausbot_company_api_key", "lower-key"],
  [{ Openmausbot_Company_Api_Key: "mixed-key" }, "Openmausbot_Company_Api_Key", "mixed-key"],
  [{ openmausbot_company_api_key: "lower-key", Openmausbot_Company_Api_Key: "mixed-key" }, "Openmausbot_Company_Api_Key", "mixed-key"],
  [{ openmausbot_company_api_key: "lower-key", OPENMAUSBOT_COMPANY_API_KEY: "canonical-key" }, "OPENMAUSBOT_COMPANY_API_KEY", "canonical-key"],
] as const)("routes managed Codex to the selected credential without renaming grants (%j)", async (grants, name, value) => {
  vi.stubEnv("OPENMAUSBOT_COMPANY_API_KEY", "inherited-company-key");
  for (const reversed of [false, true]) {
    const receipt = join(homedir(), `managed-${name}-${Object.keys(grants).length}-${reversed}.json`);
    const instance = await CodexDriver.create({
      instanceId: "managed-selection", displayName: "Fixture", enabled: true,
      environment: {
        ...Object.fromEntries(reversed ? Object.entries(grants).toReversed() : Object.entries(grants)),
        CODEX_HOME: join(homedir(), "codex-managed"), FAKE_CODEX_DUMP: receipt, FAKE_CODEX_DUMP_TURNS_ONLY: "1", FAKE_CODEX_TEXT_LOG: `${receipt}.text`,
      },
      config: CodexDriver.decodeConfig({ cli, managed: { url: "http://127.0.0.1:9/v1", models: ["fixture-model"] } }),
    });
    const recorder = recordEvents(instance.adapter);
    try {
      expect(await instance.snapshot()).toMatchObject({ state: "available", authenticated: true });
      const { turnId } = await instance.adapter.sendTurn({ threadId: "managed-selection", text: "hello", model: "fixture-model" });
      expect(await recorder.until(event => event.type === "turn.completed" && event.turnId === turnId)).toMatchObject({ ok: true });
      const seen = JSON.parse(readFileSync(receipt, "utf8"));
      expect(seen.argv).toContain(`model_providers.openmaus_company.env_key="${name}"`);
      expect(seen.env[name]).toBe(value);
      for (const [key, granted] of Object.entries(grants)) expect(seen.env[key]).toBe(granted);
      expect(await instance.generateMemoryText!("synthetic background prompt")).toBe("fake background answer");
      const background = JSON.parse(readFileSync(`${receipt}.text`, "utf8").trim());
      expect(background.argv).toContain(`model_providers.openmaus_company.env_key="${name}"`);
    } finally { recorder.stop(); await instance.dispose(); }
  }
});
