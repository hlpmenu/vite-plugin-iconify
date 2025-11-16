import { rm } from "node:fs/promises";
import { $ } from "bun";

const build = async () => {
	const entrypoints = ["src/index.ts"];
	const outdir = "./dist";

	// Clean output directory before building
	try {
		await rm(outdir, { recursive: true, force: true });
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
	try {
		const res = await Bun.build({
			entrypoints,
			outdir,
			format: "esm",
			target: "node",
			minify: true,
			sourcemap: true,
			external: ["@vue/compiler-sfc"],
		});
		if (res.outputs.length === 0) {
			throw new Error("No output files generated.");
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
	console.log("Build complete.");
	console.log("Building types...");
	try {
		// Generate declaration files only using tsgo (use tsconfig includes)
		await $`bunx --bun tsgo --declaration --emitDeclarationOnly --outDir ${outdir}`;
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
};

build();
