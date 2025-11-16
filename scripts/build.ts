import { rm, cp } from "node:fs/promises";
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
		// Generate declaration files only using tsgo (use tsconfig includes)
		await $`bunx --bun tsgo --outDir ${outdir}`;
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}
	console.log("Copying package.json...");
	try {
		await cp("package.npm.json", "dist/package.json", { force: true });
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}
};

build();
