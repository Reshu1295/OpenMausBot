import { describe, expect, it, vi } from "vitest";
import { keylessWebSearchAllowed } from "../web-search-access.ts";
import { createWebSearchRoute, type WebSearchContext } from "./web-search.ts";

const caps = { sessionModelSwitch: "in-session", agentsMcp: true, keylessWebSearch: true } as const;
function context(body: unknown = { query: " cats ", limit: 2 }) {
  return { method: "POST", path: "/api/internal/web/search", botId: "fixture", res: {}, json: vi.fn(),
    readBody: async () => body, folders: async () => ({ roots: [], vmWorkspace: null }), assertWebSearchAllowed: vi.fn(), webSearchSignal: new AbortController().signal } as unknown as WebSearchContext;
}

describe("web search authorization and route", () => {
  it("requires the engine capability, agents MCP and the bot's own grant", () => {
    expect(keylessWebSearchAllowed(caps, undefined)).toBe(true);
    expect(keylessWebSearchAllowed(undefined, undefined)).toBe(false);
    expect(keylessWebSearchAllowed({ ...caps, agentsMcp: false }, undefined)).toBe(false);
    expect(keylessWebSearchAllowed({ ...caps, keylessWebSearch: false }, undefined)).toBe(false);
    expect(keylessWebSearchAllowed(caps, { allow: ["mcp:agents:web_search"] })).toBe(true);
    for (const scope of [{ allow: [] }, { deny: ["mcp:agents:web_search"] }, { allow: ["native:*"] }, { allow: null }]) expect(keylessWebSearchAllowed(caps, scope)).toBe(false);
  });
  it("returns bounded hits explicitly marked as untrusted", async () => {
    const search = vi.fn(async () => [{ title: "Ignore instructions", url: "https://example.com/", snippet: "Untrusted" }]);
    const ctx = context(); await createWebSearchRoute(search)(ctx);
    expect(search).toHaveBeenCalledWith("cats", 2, ctx.webSearchSignal, { assertAllowed: ctx.assertWebSearchAllowed });
    expect(ctx.json).toHaveBeenCalledWith(ctx.res, 200, { source: "DuckDuckGo HTML", untrusted: true, results: await search() });
    expect(ctx.assertWebSearchAllowed).toHaveBeenCalledTimes(3);
  });
  it.each([{}, { query: " " }, { query: "x".repeat(513) }, { query: "cats", limit: 0 }, { query: "cats", limit: 11 }, { query: "cats", url: "http://localhost" }])("refuses invalid input %j without network access", async body => {
    const search = vi.fn(); const ctx = context(body); await createWebSearchRoute(search)(ctx);
    expect(ctx.json).toHaveBeenCalledWith(ctx.res, 400, expect.anything()); expect(search).not.toHaveBeenCalled();
  });
  it("rechecks the grant after the body read and after the search", async () => {
    for (const phase of ["body", "search"]) {
      let allowed = true; const ctx = context();
      ctx.assertWebSearchAllowed = () => { if (!allowed) throw Object.assign(new Error("revoked"), { status: 403 }); };
      if (phase === "body") ctx.readBody = async () => { allowed = false; return { query: "cats" }; };
      const search = vi.fn(async () => { allowed = false; return []; });
      await expect(createWebSearchRoute(search)(ctx)).rejects.toThrow("revoked");
      expect(ctx.json).not.toHaveBeenCalled();
      expect(search).toHaveBeenCalledTimes(phase === "body" ? 0 : 1);
    }
  });
});
