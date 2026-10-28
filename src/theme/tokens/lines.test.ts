import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FADED = /(?<![\w-])(?:[\w[\]&>*:-]+:)*[a-z]+(?:-[a-z]+)?-(?:hairline|edge)\/[\w.[\]]+/g;

describe("lines", () => {
  it("draw in the hairline or edge token as each skin tunes it, never faded with an opacity modifier", () => {
    const files = execFileSync("git", ["ls-files", "src"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter((file) => /\.(tsx?|css)$/.test(file) && !file.endsWith("lines.test.ts"));
    const faded = files.flatMap((file) => [...readFileSync(`${ROOT}${file}`, "utf8").matchAll(FADED)].map(([match]) => `${file}: ${match}`));
    expect(faded).toEqual([]);
  });
});
