const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["src/index.js"],
  bundle: true,
  platform: "node",
  target: "node24",
  outfile: "dist/index.js",
  format: "cjs",
  minify: false,
  sourcemap: false,
  external: ["@actions/core"]
}).catch(() => process.exit(1));
