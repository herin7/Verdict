// Bundles the two Lambda entry points into single ESM files (dist-lambda/<name>/index.mjs).
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("dist-lambda", { recursive: true, force: true });
for (const name of ["api", "worker"]) {
  await build({
    entryPoints: [`src/handlers/${name}.ts`],
    outfile: `dist-lambda/${name}/index.mjs`,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // No sourcemap: an inline map tripled the bundle and --enable-source-maps parsed it on every cold start.
    // Identifiers stay unminified so stack traces still name real functions.
    minifyWhitespace: true,
    minifySyntax: true,
    keepNames: true,
    // Some deps still call require(); give ESM bundles a working one.
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: "warning",
  });
}
console.log("built dist-lambda/{api,worker}/index.mjs");
