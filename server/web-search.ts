import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { resolveTarget } from "./browser/egress/gate.ts";
import { addressClass, ownAddresses } from "./browser/egress/policy.ts";

const ENDPOINT = "https://html.duckduckgo.com/html/";
export const WEB_SEARCH_TIMEOUT_MS = 15_000;
export const WEB_SEARCH_MAX_BYTES = 1024 * 1024;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const text = (html: string, max: number) => decode(html.replace(/<[^<>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, max);
const attribute = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag)?.[2] ?? "";

function element(html: string, className: string): { tag: string; body: string } | null {
  for (const match of html.matchAll(/<([a-z]+)\b[^<>]*>/gi)) {
    if (!attribute(match[0], "class").split(/\s+/).includes(className)) continue;
    const start = match.index + match[0].length;
    const end = html.indexOf(`</${match[1]}`, start);
    if (end !== -1) return { tag: match[0], body: html.slice(start, end) };
  }
  return null;
}

export interface WebSearchHit { title: string; url: string; snippet: string }

export function parseSearchResults(html: string, limit: number): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  const seen = new Set<string>();
  const sections = html.split(/<div\b[^<>]*\bclass\s*=\s*["'][^"']*\bresult\b[^"']*["'][^<>]*>/i);
  for (const section of sections) {
    const link = element(section, "result__a");
    if (!link) continue;
    try {
      const wrapped = new URL(decode(attribute(link.tag, "href")), ENDPOINT);
      const url = new URL(wrapped.hostname === "duckduckgo.com" || wrapped.hostname === "html.duckduckgo.com"
        ? wrapped.searchParams.get("uddg") ?? wrapped.href : wrapped.href);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 2048 || seen.has(url.href)) continue;
      const title = text(link.body, 300);
      if (!title) continue;
      seen.add(url.href);
      results.push({ title, url: url.href, snippet: text(element(section, "result__snippet")?.body ?? "", 1000) });
      if (results.length >= limit) break;
    } catch { continue; }
  }
  return results;
}

export interface WebSearchOptions {
  /** Test seams; the harness never accepts these from a bot or configuration. */
  assertAllowed?: () => void;
  resolve?: typeof resolveTarget;
  request?: typeof httpsRequest;
  timeoutMs?: number;
  maxBytes?: number;
}

export async function searchWeb(query: string, limit = 5, signal?: AbortSignal, options: WebSearchOptions = {}): Promise<WebSearchHit[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  const deadline = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Web search stopped or timed out."));
    deadline.addEventListener("abort", onAbort, { once: true });
  });
  const run = async () => {
    options.assertAllowed?.();
    const addresses = await (options.resolve ?? resolveTarget)(url.hostname);
    deadline.throwIfAborted();
    const own = ownAddresses();
    if (!addresses.length || addresses.some(({ address }) => addressClass(address, own) !== "public")) throw new Error("Web search destination is not public.");
    options.assertAllowed?.();
    const address = addresses[0]!;
    const lookup: LookupFunction = (_host, settings, done) => {
      if (settings.all) done(null, [address]);
      else done(null, address.address, address.family);
    };
    const html = await new Promise<string>((resolve, reject) => {
      const req = (options.request ?? httpsRequest)(url, {
        agent: false, lookup, signal: deadline,
        headers: { "user-agent": "OpenMausBot/1.0 (web search)", accept: "text/html", "accept-encoding": "identity" },
      }, response => {
        response.on("error", reject);
        if (response.statusCode !== 200 || !/^text\/html\b/i.test(response.headers["content-type"] ?? "") ||
            (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
          response.destroy();
          reject(new Error("Web search is unavailable. Try again later."));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > (options.maxBytes ?? WEB_SEARCH_MAX_BYTES)) {
            reject(new Error("Web search response is too large."));
            response.destroy();
          } else chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("aborted", () => reject(new Error("Web search response was interrupted.")));
      });
      req.on("error", () => reject(new Error("Web search could not be reached.")));
      req.end();
    });
    const results = parseSearchResults(html, limit);
    if (!results.length && !/class=["'][^"']*\bno-results\b|No results found/i.test(html)) throw new Error("Web search returned no readable results. It may be blocked; try again later.");
    return results;
  };
  try { return await Promise.race([run(), aborted]); }
  finally { deadline.removeEventListener("abort", onAbort); }
}
