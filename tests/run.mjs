import { build } from "esbuild";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const files = (await readdir("tests")).filter((f) =>
  /\.test\.(ts|mjs)$/.test(f),
);
await build({
  entryPoints: files.map((f) => `tests/${f}`),
  outdir: ".test-build",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: { obsidian: resolve("tests/obsidian-mock.mjs") },
});
const result = spawnSync(
  process.execPath,
  [
    "--test",
    ...files.map((f) => `.test-build/${f.replace(/\.(ts|mjs)$/, ".mjs")}`),
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
