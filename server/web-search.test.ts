import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse, type RequestOptions, type Server } from "node:http";
import type { request as httpsRequest } from "node:https";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSearchResults, searchWeb, type WebSearchOptions } from "./web-search.ts";

const html = `<html><div class="result results_links web-result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide%3Fa%3D1%26b%3D2&amp;rut=x">A <b>guide</b> &amp; &#x1f680;</a><a class="result__snippet">Read <b>this</b> guide.</a></div><div class="result results_links"><a class="result__a" href="https://example.org/">Second</a><div class="result__snippet">Another result</div></div></html>`;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
  })));
});

async function fixture(reply: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(reply); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const targets: URL[] = [];
  const settings: RequestOptions[] = [];
  const request = ((url: URL, options: RequestOptions, listener: Parameters<typeof httpRequest>[2]) => {
    targets.push(url); settings.push(options);
    return httpRequest(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, { ...options, lookup: undefined }, listener);
  }) as typeof httpsRequest;
  const resolve = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { targets, settings, resolve, options: { request, resolve } satisfies WebSearchOptions };
}

describe("DuckDuckGo HTML search", () => {
  it("unwraps links, decodes text and keeps snippets with their result", () => {
    expect(parseSearchResults(html, 5)).toEqual([
      { title: "A guide & 🚀", url: "https://example.com/guide?a=1&b=2", snippet: "Read this guide." },
      { title: "Second", url: "https://example.org/", snippet: "Another result" },
    ]);
    expect(parseSearchResults(html, 1)).toHaveLength(1);
  });
  it("skips malformed, credential-bearing and executable links and duplicate results", () => {
    const result = (href: string) => `<div class="result"><a class="result__a" href="${href}">Title</a></div>`;
    expect(parseSearchResults(["javascript:alert(1)", "data:text/html,x", "https://name:secret@example.com/", "http://[invalid", "https://example.org/", "https://example.org/"].map(result).join(""), 10))
      .toEqual([{ title: "Title", url: "https://example.org/", snippet: "" }]);
  });
  it("uses one fixed keyless request and pins the checked address without a proxy or credentials", async () => {
    const f = await fixture((req, res) => {
      expect(req.url).toBe("/html/?q=cats+%26+dogs");
      expect(req.headers.authorization).toBeUndefined(); expect(req.headers.cookie).toBeUndefined();
      res.writeHead(200, { "content-type": "text/html" }); res.end(html);
    });
    expect(await searchWeb("cats & dogs", 1, undefined, f.options)).toHaveLength(1);
    expect(f.targets[0].origin).toBe("https://html.duckduckgo.com");
    expect(f.resolve).toHaveBeenCalledOnce();
    expect(f.settings[0].agent).toBe(false);
    const done = vi.fn();
    (f.settings[0].lookup as LookupFunction)("html.duckduckgo.com", {}, done);
    expect(done).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd12::1", "::ffff:127.0.0.1", "240.0.0.1"])("refuses DNS answer %s before a connection", async address => {
    const request = vi.fn();
    await expect(searchWeb("test", 5, undefined, { request: request as typeof httpsRequest, resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }] })).rejects.toThrow("not public");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([302, 202, 429, 503])("refuses HTTP %s without following a redirect or returning a challenge as results", async status => {
    const f = await fixture((_req, res) => { res.writeHead(status, { location: "http://127.0.0.1/private", "content-type": "text/html" }); res.end(html); });
    await expect(searchWeb("test", 5, undefined, f.options)).rejects.toThrow("unavailable");
    expect(f.targets).toHaveLength(1);
  });
  it("distinguishes no results from an HTML challenge", async () => {
    const empty = await fixture((_req, res) => { res.setHeader("content-type", "text/html"); res.end('<div class="no-results">No results found</div>'); });
    expect(await searchWeb("test", 5, undefined, empty.options)).toEqual([]);
    const challenge = await fixture((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<html>Please solve this challenge</html>"); });
    await expect(searchWeb("test", 5, undefined, challenge.options)).rejects.toThrow("no readable results");
  });
  it("rejects oversized, wrong-type and interrupted responses", async () => {
    const big = await fixture((_req, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
    await expect(searchWeb("test", 5, undefined, { ...big.options, maxBytes: 10 })).rejects.toThrow("too large");
    const binary = await fixture((_req, res) => { res.setHeader("content-type", "application/pdf"); res.end(html); });
    await expect(searchWeb("test", 5, undefined, binary.options)).rejects.toThrow("unavailable");
    const partial = await fixture((_req, res) => { res.writeHead(200, { "content-type": "text/html", "content-length": "10000" }); res.write(html); setImmediate(() => res.destroy()); });
    await expect(searchWeb("test", 5, undefined, partial.options)).rejects.toThrow();
  });
  it("bounds both DNS and the complete streamed response, and accepts turn cancellation", async () => {
    const f = await fixture((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.write("<html>"); });
    await expect(searchWeb("test", 5, undefined, { ...f.options, timeoutMs: 30 })).rejects.toThrow();
    await expect(searchWeb("test", 5, undefined, { ...f.options, timeoutMs: 30, resolve: () => new Promise(() => {}) })).rejects.toThrow();
    const stop = new AbortController();
    const pending = searchWeb("test", 5, stop.signal, f.options); stop.abort();
    await expect(pending).rejects.toThrow();
  });
  it("rechecks authorization after DNS before connecting", async () => {
    const f = await fixture((_req, res) => res.end(html));
    let allowed = true;
    const resolve = async () => { allowed = false; return [{ address: "93.184.216.34", family: 4 }]; };
    await expect(searchWeb("test", 5, undefined, { ...f.options, resolve, assertAllowed: () => { if (!allowed) throw new Error("revoked"); } })).rejects.toThrow("revoked");
    expect(f.targets).toEqual([]);
  });
});
