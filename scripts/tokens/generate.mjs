#!/usr/bin/env node
// Writes the skins from src/theme/tokens into src/styles.css and electron/skin-overlay.cjs, between their
// `@generated tokens:*` markers. --check fails instead of writing when a file is out of date.
//
//   node scripts/tokens/generate.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { generateDesktop } from "../../src/theme/tokens/generate.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values } = parseArgs({ options: { check: { type: "boolean" } } });

const paths = { styles: join(root, "src/styles.css"), overlay: join(root, "electron/skin-overlay.cjs") };
const current = { styles: readFileSync(paths.styles, "utf8"), overlay: readFileSync(paths.overlay, "utf8") };
const next = generateDesktop(current);

let stale = false;
for (const key of Object.keys(paths)) {
  if (current[key] === next[key]) continue;
  if (values.check) {
    stale = true;
    console.error(`✗ ${relative(root, paths[key])} is out of date: run node scripts/tokens/generate.mjs`);
  } else {
    writeFileSync(paths[key], next[key]);
    console.log(`wrote ${relative(root, paths[key])}`);
  }
}
if (values.check && !stale) console.log("✓ src/styles.css and electron/skin-overlay.cjs match src/theme/tokens");
if (stale) process.exit(1);
