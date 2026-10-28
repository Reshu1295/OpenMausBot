import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SKIN_IDS, SKINS as PICKER } from "@/lib/skins";
import { distance, oklch, oklchOfP3, p3 } from "./color.ts";
import { generateDesktop } from "./generate.ts";
import { px, radiusScale } from "./radius.ts";
import { SKINS } from "./index.ts";
import { COLOR_TOKENS, WIDE_GAMUT_LIFT, type ColorToken } from "./skin.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");
const COLOUR = /^(#[0-9a-f]{6}([0-9a-f]{2})?|transparent|color-mix\(in srgb, var\(--color-[a-z-]+\) \d+%, transparent\)|var\(--color-[a-z-]+\))$/i;

describe("the token source", () => {
  it("matches the generated regions: run node scripts/tokens/generate.mjs after editing src/theme/tokens", () => {
    const files = { styles: read("src/styles.css"), overlay: read("electron/skin-overlay.cjs") };
    const generated = generateDesktop(files);
    expect(generated.styles === files.styles, "src/styles.css differs from the token source").toBe(true);
    expect(generated.overlay === files.overlay, "electron/skin-overlay.cjs differs from the token source").toBe(true);
  });

  it("holds the picker's skins, in its order and with its names", () => {
    expect(SKINS.map((skin) => skin.id)).toEqual([...SKIN_IDS]);
    expect(SKINS.map((skin) => skin.label)).toEqual(PICKER.map((skin) => skin.name));
  });

  it("gives every skin a colour for every token", () => {
    for (const skin of SKINS) {
      for (const token of COLOR_TOKENS) expect(skin.colors[token], `${skin.id} ${token}`).toMatch(COLOUR);
      for (const [token, value] of Object.entries(skin.phone?.colors ?? {})) expect(value, `${skin.id} phone ${token}`).toMatch(COLOUR);
    }
  });

  it("keeps each pinned wide-gamut twin within reach of its sRGB hex, so a changed hex cannot keep a stale twin", () => {
    for (const skin of SKINS) {
      for (const [token, pinned] of Object.entries(skin.wideGamut.pinned ?? {})) {
        const base = oklch(skin.colors[token as ColorToken]);
        const derived = oklchOfP3(p3({ ...base, c: base.c * WIDE_GAMUT_LIFT }));
        expect(distance(oklchOfP3(pinned), derived), `${skin.id} ${token}`).toBeLessThan(0.03);
      }
    }
  });

  it("keeps every skin's corner scale strictly increasing, on desktop and phone", () => {
    for (const skin of SKINS) {
      for (const set of [skin.radius, { ...skin.radius, ...skin.phone?.radius }]) {
        const scale = Object.values(radiusScale(set)).map(px);
        expect(scale, skin.id).toEqual([...scale].sort((a, b) => a - b));
        expect(new Set(scale).size, skin.id).toBe(scale.length);
      }
    }
  });
});
