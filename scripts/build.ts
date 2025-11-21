#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */

import { rm, cp } from "node:fs/promises";
import * as rollup from "rollup";
import dts from "rollup-plugin-dts";
import compileComponent from "../vue_component/compile";
import copyAssets from "./copy_assets";

const isProduction = () => process.env.PRODUCTION ? true : false




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
			sourcemap: isProduction() ? false : true,
			target: "node",
			format: "esm",
			packages: "bundle",
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
		const cfg = rollup.defineConfig({
			input: "src/index.ts",
			output: [{ file: "dist/index.d.ts", format: "es" }],
			plugins: [dts()],
		});
		const rollupBuild = await rollup.rollup(cfg);
		await rollupBuild.write({
			file: "dist/index.d.ts",
			format: "es",
		});
		
		
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}

	console.log("Buildig nuxt module...");
	try {	
		const res = await Bun.build({
			entrypoints: ["nuxt/src/module.ts"],
			outdir: "dist/nuxt",
			minify: true,
			tsconfig: "nuxt/tsconfig.json",
			sourcemap: process.env.PRODUCTION ? false : true,
			target: "node",
			format: "esm",
			packages: "bundle",
			external: ["@nuxt/kit", "@nuxt/schema", "@hlmpn/vite-plugin-iconify"],
		});
		if (!res || res.outputs.length <= 0 || !res.success) {
			throw new Error(`Failed to build nuxt module: ${res?.logs?.join("\n")}`);
		}

	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}
	try {
		const cfg = rollup.defineConfig({
			input: "nuxt/src/module.ts",
			output: [{ dir: "dist/nuxt/", format: "es" }],
			external: ["@nuxt/kit", "@nuxt/schema", "@hlmpn/vite-plugin-iconify"],
			plugins: [dts()],
		});
		const rollupBuild = await rollup.rollup(cfg);
		const res = await rollupBuild.write({
			dir: "dist/nuxt/",
			format: "es",
		});
		if (res.output.length <= 0 || !res.output[0].code) {
			throw new Error(`Failed to build nuxt module. No output code.`);
		}
		
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}

	try {
		const vueComponent = await compileComponent({
			inputFilePath: "vue_component/Icon.vue",
			outputFilePath: "dist/vue_component/component.js",
		});
		if (!vueComponent) throw new Error("Failed to build vue component.");
		await Bun.write("./dist/vue_component/component.js", vueComponent);
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

	try {
		copyAssets()
	} catch (e) {
		await rm("dist", { recursive: true, force: true });
		console.error(e);
		process.exit(1);
	}
	

};

build();
