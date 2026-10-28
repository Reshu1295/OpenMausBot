import { GEIST } from "../fonts.ts";
import type { SkinSource } from "../skin.ts";

/**
 * The MausBot brand look: a white page, a sidebar washed in the faintest green, mint for the selected row and a calm
 * green accent. The brand green #1f8a52 carries white at only 4.3:1, so the filled accent is one step deeper; the
 * brand green stays as the accent border.
 */
export default {
  id: "meadow",
  label: "Meadow",
  mode: "light",
  colors: {
    // the thread
    app: "#ffffff",
    // sidebar
    panel: "#f6f8f6",
    raised: "#e9eeea",
    // the selected row, mint
    "raised-hover": "#d6efdf",
    composer: "#ffffff",
    "composer-ring": "#e3e9e4",
    // what a bot says
    card: "#f1f5f2",
    menu: "#ffffff",
    "menu-hover": "color-mix(in srgb, var(--color-raised) 70%, transparent)",
    "menu-active": "var(--color-raised)",
    // the search field
    inset: "#e7ece8",
    // a chip on a card
    control: "#dce3de",
    hairline: "#c9d3cc",
    ink: "#0f1a13",
    "ink-secondary": "#3e4a42",
    "ink-tertiary": "#4f5c54",
    accent: "#1a7a48",
    "accent-border": "#1f8a52",
    "accent-text": "#176b3f",
    focus: "#1a7a48",
    "accent-ink": "#ffffff",
    // your own messages, a step under a bot's card
    "bubble-user": "#e1e9e3",
    "bubble-user-ink": "#0f1a13",
    success: "#1a7a48",
    "success-ink": "#ffffff",
    danger: "#c02b3a",
    "danger-ink": "#ffffff",
    warning: "#8a5a00",
    scrollbar: "#c3cdc6",
    "maus-line": "#5a675f",
  },
  font: GEIST,
  radius: { lg: "10px", xl: "16px" },
  identity: {
    green: "#00884e",
    blue: "#2573e4",
    red: "#d63f47",
    orange: "#b65f15",
    purple: "#8057C8",
    cyan: "#0b819b",
    pink: "#d3397d",
    yellow: "#93721b",
    teal: "#018577",
    coral: "#db3a20",
    silver: "#707782",
    chrome: "#6b778a",
  },
  captionSymbol: "#4d5a52",
  wideGamut: {
  },
  phone: {
    colors: {
      app: "#f6f8f6",
      panel: "#fcfdfc",
      card: "#ffffff",
      inset: "#e9eeea",
      "composer-ring": "#cfd8d1",
      hairline: "#c1ccc4",
    },
    radius: {
      lg: "12px",
      xl: "18px",
      "2xl": "22px",
      "3xl": "28px",
      menu: "22px",
    },
  },
  phones: true,
} satisfies SkinSource;
