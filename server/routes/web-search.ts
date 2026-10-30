import { z } from "zod";
import { searchWeb } from "../web-search.ts";
import type { HelperToolContext } from "./helper-tools.ts";
import { PASS } from "./table.ts";

export interface WebSearchContext extends HelperToolContext {
  assertWebSearchAllowed(): void;
  webSearchSignal: AbortSignal;
}

const input = z.object({ query: z.string().trim().min(1).max(512), limit: z.number().int().min(1).max(10).default(5) }).strict();

export function createWebSearchRoute(search: typeof searchWeb = searchWeb) {
  return async (ctx: WebSearchContext): Promise<typeof PASS | void> => {
    if (ctx.method !== "POST" || ctx.path !== "/api/internal/web/search") return PASS;
    ctx.assertWebSearchAllowed();
    const parsed = input.safeParse(await ctx.readBody());
    if (!parsed.success) return ctx.json(ctx.res, 400, { error: "Web search needs a public query of 1–512 characters and a limit of 1–10." });
    ctx.assertWebSearchAllowed();
    try {
      const results = await search(parsed.data.query, parsed.data.limit, ctx.webSearchSignal, { assertAllowed: ctx.assertWebSearchAllowed });
      ctx.assertWebSearchAllowed();
      ctx.json(ctx.res, 200, { source: "DuckDuckGo HTML", untrusted: true, results });
    } catch (error) {
      ctx.assertWebSearchAllowed();
      ctx.json(ctx.res, 502, { error: error instanceof Error ? error.message : "Web search failed." });
    }
  };
}
