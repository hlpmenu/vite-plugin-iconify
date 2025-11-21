import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "vite";
import { parseAttributes, buildSvgUrl, fetchSvg } from "./utils";
import transformReact from "./transform_react";
import { parseIconBinding } from "./fast_path";
import { createStaticResolver } from "./static_evaluator";
import type { IconBindingResult } from "./types";

const pluginName = "[vite-plugin-iconify] ";

// biome-ignore lint/suspicious/noExplicitAny: Vite's Plugin typing expects Plugin<any>.
const IconifySfcPlugin = (): Plugin<any> => {
	return {
		name: "vite-plugin-iconify",
		//apply: "build",
		enforce: "pre",

		async transform(code: string, id: string): Promise<string | undefined> {
			const filter = createFilter(["**/*.vue"]);
			const reactFilter = createFilter(["**/*.jsx", "**/*.tsx"]);

			if (reactFilter(id)) {
				return transformReact(code, id);
			}
			if (!filter(id)) return;

			const iconRegex = /<Icon\s+([^>]*?)\/>/g;
			const matches = [...code.matchAll(iconRegex)];
			if (!matches.length) return;

			let transformedCode = code;
			let staticResolver: {
				resolveToString: (e: string) => Promise<string | null>;
			} | null = null;

			for (const match of matches) {
				const fullMatch = match[0];
				const attributes = parseAttributes(match[1]);

				// Decide binding type
				let bindingResult: IconBindingResult | null = null;

				if (attributes.icon) {
					bindingResult = { type: "single", icon: attributes.icon };
				} else {
					const boundExpr =
						attributes[":icon"] ?? attributes["v-bind:icon"] ?? undefined;
					// Fast path
					bindingResult = parseIconBinding(boundExpr);

					// FINAL PASS: try constant-folding if still unknown
					if (!bindingResult && boundExpr) {
						staticResolver ??= await createStaticResolver(code, id, this);
						const resolved = await staticResolver.resolveToString(boundExpr);
						if (resolved) {
							bindingResult = { type: "single", icon: resolved };
						}
					}
				}

				if (!bindingResult) {
					// leave <Icon> for runtime
					continue;
				}

				// Attributes to exclude from copy
				const iconSpecificKeys = new Set([
					"icon",
					":icon",
					"v-bind:icon",
					"width",
					"height",
					"color",
					"flip",
				]);

				const filteredAttributes = Object.entries(attributes)
					.filter(([key]) => !iconSpecificKeys.has(key))
					.map(([key, value]) => `${key}="${value ?? ""}"`)
					.join(" ");

				const addAttrsToSvg = (svgContent: string, extra?: string) => {
					const svg = svgContent;
					const attrsParts = [
						filteredAttributes.trim().length > 0 ? filteredAttributes : null,
						extra && extra.trim().length > 0 ? extra : null,
					].filter(Boolean);

					if (attrsParts.length === 0) return svg;
					const attrsString = ` ${attrsParts.join(" ")}`;
					return svg.replace("<svg", `<svg${attrsString}`);
				};

				if (bindingResult.type === "single") {
					const iconValue = bindingResult.icon;

					const [prefixRaw, nameRaw] = iconValue.split(":");
					const prefix = prefixRaw?.replaceAll(`'`, "").replaceAll(`"`, "");
					const name = nameRaw?.replaceAll(`'`, "").replaceAll(`"`, "");

					if (!prefix || !name) {
						console.warn(
							`${pluginName}Invalid 'icon' format in <Icon />: "${iconValue}".`,
						);
						continue;
					}

					const svgUrl = buildSvgUrl(prefix, name, attributes);
					const svgContent = await fetchSvg(svgUrl);
					if (!svgContent) {
						console.warn(
							`${pluginName}Failed to fetch SVG for "${iconValue}".`,
						);
						continue;
					}

					const svgWithAttrs = addAttrsToSvg(svgContent);
					transformedCode = transformedCode.replace(fullMatch, svgWithAttrs);
				} else if (bindingResult.type === "conditional") {
					const [icon1, icon2] = bindingResult.icons;
					const condition = bindingResult.condition;

					const [p1Raw, n1Raw] = icon1.split(":");
					const prefix1 = p1Raw?.replaceAll(`'`, "").replaceAll(`"`, "");
					const name1 = n1Raw?.replaceAll(`'`, "").replaceAll(`"`, "");

					const [p2Raw, n2Raw] = icon2.split(":");
					const prefix2 = p2Raw?.replaceAll(`'`, "").replaceAll(`"`, "");
					const name2 = n2Raw?.replaceAll(`'`, "").replaceAll(`"`, "");

					if (!prefix1 || !name1 || !prefix2 || !name2) {
						console.warn(
							`${pluginName}Invalid ternary 'icon' format in <Icon />: "${icon1}", "${icon2}".`,
						);
						continue;
					}

					const svgUrl1 = buildSvgUrl(prefix1, name1, attributes);
					const svgUrl2 = buildSvgUrl(prefix2, name2, attributes);
					const svgContent1 = await fetchSvg(svgUrl1);
					const svgContent2 = await fetchSvg(svgUrl2);
					if (!svgContent1 || !svgContent2) {
						console.warn(
							`${pluginName}Failed to fetch SVG for conditional icons "${icon1}" or "${icon2}".`,
						);
						continue;
					}

					const svg1 = addAttrsToSvg(svgContent1, `v-if="${condition}"`);
					const svg2 = addAttrsToSvg(svgContent2, "v-else");
					transformedCode = transformedCode.replace(
						fullMatch,
						`${svg1}${svg2}`,
					);
				}
			}

			return transformedCode;
		},
	};
};

export default IconifySfcPlugin;
