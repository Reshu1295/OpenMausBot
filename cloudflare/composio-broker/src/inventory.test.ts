import { afterEach, describe, expect, it, vi } from "vitest";

import { brokerHarness } from "./test-harness";

afterEach(() => vi.unstubAllGlobals());

describe.each(["connected_accounts", "toolkits"])("broker %s inventory", (walker) => {
  it.each(["repeated cursor", "cursor cycle", "page cap", "missing items", "invalid items", "HTTP failure"])(
    "returns unavailable on %s while a retained account remains reachable", async (failure) => {
      const h = brokerHarness();
      vi.stubGlobal("fetch", h.composio.fetchImpl);
      try {
        const owner = await h.install();
        const gmail = h.account(owner);
        vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith(`/${walker}`)) {
            const cursor = url.searchParams.get("cursor");
            if (failure === "missing items") return Response.json({});
            if (failure === "invalid items") return Response.json({ items: {} });
            if (failure === "HTTP failure") return Response.json({ error: "synthetic outage" }, { status: 503 });
            const next = failure === "page cap" ? `${Number(cursor ?? 0) + 1}`
              : failure === "cursor cycle" && cursor === "a" ? "b" : "a";
            return Response.json({ items: [], next_cursor: next });
          }
          if (url.pathname.endsWith("/connected_accounts") || url.pathname.endsWith("/toolkits")) {
            return Response.json({ items: [] });
          }
          return h.composio.fetchImpl(input, init);
        });
        const inventory = await h.call(owner, "/v1/connectors/connected");
        vi.stubGlobal("fetch", h.composio.fetchImpl);
        const rpc = await h.call(owner, "/v1/mcp", {
          method: "POST",
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "GMAIL_SEND_EMAIL", arguments: {} } }),
        });
        const result = await rpc.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(result.result.content[0]!.text)).toMatchObject({ accounts: [gmail] });
        expect(inventory.status).toBe(503);
        await expect(inventory.json()).resolves.toMatchObject({ error: expect.any(String) });

        const recovered = await h.call(owner, "/v1/connectors/connected");
        expect(recovered.status).toBe(200);
        await expect(recovered.json()).resolves.toMatchObject({ services: { gmail: { connected: true } } });
      } finally {
        h.d1.db.close();
      }
    },
  );
});

it("proves completeness for a legitimately empty installation", async () => {
  const h = brokerHarness();
  vi.stubGlobal("fetch", h.composio.fetchImpl);
  try {
    const owner = await h.install();
    const response = await h.call(owner, "/v1/connectors/connected");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: true, services: {}, complete: true });
  } finally {
    h.d1.db.close();
  }
});
