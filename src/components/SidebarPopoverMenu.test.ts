import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

// Drawn open: the menu's own motion and dismissal are not what is tested here.
vi.mock("./MenuMotion", () => ({ useMenuMotion: () => ({ shown: true, exitProps: {}, className: "" }) }));
vi.mock("@/hooks/use-popover-dismiss", () => ({ usePopoverDismiss: () => {} }));
import { SidebarPopoverMenu } from "./SidebarPopoverMenu";

// The inline "below" sheet; the anchored "above" one renders in a portal and is driven in a DOM elsewhere.
const render = (items: Parameters<typeof SidebarPopoverMenu>[0]["items"]) =>
  renderToStaticMarkup(createElement(SidebarPopoverMenu, { items, ariaLabel: "Menu", placement: "below", renderTrigger: () => "trigger" }));

it("draws an item's second line (where it connects) and third line (a note) under its label", () => {
  const html = render([
    { key: "cloud", label: "Connect your phone", subtitle: "to your Cloud (always on)", onSelect: () => {} },
    { key: "here", label: "Connect your phone", subtitle: "to this computer", note: "Your Cloud shows here once it is ready.", onSelect: () => {} },
    { key: "plain", label: "Settings", onSelect: () => {} },
  ]);
  expect(html).toMatch(/Connect your phone<\/span><span[^>]*>to your Cloud \(always on\)<\/span>/);
  expect(html).toMatch(/to this computer<\/span><span[^>]*>Your Cloud shows here once it is ready\.<\/span>/);
  expect(html.indexOf("to your Cloud (always on)")).toBeLessThan(html.indexOf("to this computer"));
  expect(html).toContain('<span class="flex-1 truncate">Settings</span>');
});

it("draws an item's attention dot on the item itself, in its tone", () => {
  const html = render([
    { key: "ready", label: "Restart to update", attention: true, attentionTone: "accent", onSelect: () => {} },
    { key: "failed", label: "Update failed", attention: true, onSelect: () => {} },
    { key: "plain", label: "Settings", onSelect: () => {} },
  ]);
  const item = (label: string) => html.split('role="menuitem"').find((chunk) => chunk.includes(`>${label}</span>`)) ?? "";
  expect(item("Restart to update")).toContain("rounded-full bg-accent");
  expect(item("Update failed")).toContain("rounded-full bg-danger");
  expect(item("Settings")).not.toMatch(/rounded-full bg-(accent|danger)/);
  expect(html.split('role="menu"')[0]).not.toMatch(/rounded-full bg-(accent|danger)/);
});

it("lets a sentence wrap instead of cutting it short, with its icon on the first line", () => {
  const html = render([
    { key: "move", label: "Your bots couldn't move to My Cloud yet.", note: "My Cloud did not answer.", wrap: true, icon: "!", onSelect: () => {} },
    { key: "progress", label: "Moving your bots to My Cloud… 34 of 120 chats", wrap: true, onSelect: () => {} },
    { key: "plain", label: "Settings", onSelect: () => {} },
  ]).replaceAll("&#x27;", "'");
  expect(html).toContain('<span class="break-words">Your bots couldn\'t move to My Cloud yet.</span>');
  expect(html).toContain('<span class="flex-1 min-w-0 break-words">Moving your bots to My Cloud… 34 of 120 chats</span>');
  expect(html).toMatch(/self-start[^"]*">!<\/span>/);
  expect(html).toContain('<span class="flex-1 truncate">Settings</span>');
});
