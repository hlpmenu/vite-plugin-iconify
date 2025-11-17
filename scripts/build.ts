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
		// Build the project
		const res = await Bun.build({
			entrypoints,
			outdir,
			minify: true,
			tsconfig: "./tsconfig.json",
			sourcemap: true,
			target: "node",
			external: ["@babel/*", "@vue/*"],
		});
		if (!res || res.outputs.length <= 0 || !res.success) {
			throw new Error(`Failed to build project: ${res?.logs?.join("\n")}`);
		}
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
	}

	try {
		// Generate declaration files only using tsgo (use tsconfig includes)
		await $`bunx --bun tsgo --declaration --emitDeclarationOnly --outDir ${outdir}`;
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
