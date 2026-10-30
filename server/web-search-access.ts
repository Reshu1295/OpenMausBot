import { allowsTool } from "../shared/tool-scope.ts";
import type { ProviderAdapter } from "./contracts.ts";

export function keylessWebSearchAllowed(capabilities: ProviderAdapter["capabilities"] | undefined, scope: unknown): boolean {
  return capabilities?.agentsMcp === true && capabilities.keylessWebSearch === true &&
    allowsTool(scope, { kind: "mcp", server: "agents", name: "web_search" });
}
