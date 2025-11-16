import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "vite";
import { parseAttributes, buildSvgUrl, fetchSvg } from "./utils";
import transformReact from "./transform_react";

const pluginName = "[vite-plugin-iconify] ";

type IconBindingResult =
	| { type: "single"; icon: string }
	| { type: "conditional"; condition: string; icons: [string, string] };

/**
 * Parse a :icon / v-bind:icon expression into something we can statically handle.
 *
 * Supports:
 *   :icon="'mdi:github'"
 *   :icon="\"mdi:github\""
 *   :icon="a ? 'mdi:github' : 'mdi:github-face'"
 */
function parseIconBinding(
	bindingExpr: string | undefined,
): IconBindingResult | null {
	if (!bindingExpr) return null;

	const expr = bindingExpr.trim();

	// 1) Simple literal: `'mdi:github'` or `"mdi:github"`
	const literalMatch = expr.match(/^(['"`])([^'"`]+)\1$/);
	if (literalMatch) {
		return { type: "single", icon: literalMatch[2] };
	}

	// 2) Simple ternary: `condition ? 'mdi:a' : 'mdi:b'`
	//    We intentionally support a fairly narrow pattern here.
	const ternaryMatch = expr.match(/^(.*?)\?(.*)$/);
	if (ternaryMatch) {
		const condition = ternaryMatch[1].trim();
		const rest = ternaryMatch[2];

		const branchesMatch = rest.match(
			/^\s*(['"`])([^'"`]+)\1\s*:\s*(['"`])([^'"`]+)\3\s*$/,
		);

		if (branchesMatch) {
			const icon1 = branchesMatch[2];
			const icon2 = branchesMatch[4];
			return {
				type: "conditional",
				condition,
				icons: [icon1, icon2],
			};
		}
	}

	// Anything else is considered too dynamic
	return null;
}

/**
 * A Vite plugin for dynamically inlining Iconify icons in Vue SFCs.
 */
export default function IconifySfcPlugin(): Plugin {
	const filter = createFilter(["**/*.vue"]);
	const reactFilter = createFilter(["**/*.jsx", "**/*.tsx"]);

	return {
		name: "vite-plugin-iconify",
		enforce: "pre", // Ensure this plugin runs before the Vue plugin

		async transform(code: string, id: string): Promise<string | void> {
			if (reactFilter(id)) {
				return transformReact(code, id);
			}
			if (!filter(id)) return;

			const iconRegex = /<Icon\s+([^>]*?)\/>/g;
			const matches = [...code.matchAll(iconRegex)];
			if (!matches.length) return;

			let transformedCode = code;

			for (const match of matches) {
				const fullMatch = match[0];
				const attributes = parseAttributes(match[1]);

				// --- figure out what kind of icon binding we have ---

				let bindingResult: IconBindingResult | null = null;

				if (attributes.icon) {
					// plain icon="mdi:github"
					bindingResult = {
						type: "single",
						icon: attributes.icon,
					};
				} else {
					// bound :icon / v-bind:icon
					const boundExpr =
						attributes[":icon"] ?? attributes["v-bind:icon"] ?? undefined;
					bindingResult = parseIconBinding(boundExpr);
				}

				if (!bindingResult) {
					// No usable static info → leave <Icon /> for runtime handling
					continue;
				}

				// These attrs should not be copied to <svg>
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
					// insert our attrs right after <svg
					let svg = svgContent;

					const attrsParts = [
						filteredAttributes.trim().length > 0 ? filteredAttributes : null,
						extra && extra.trim().length > 0 ? extra : null,
					].filter(Boolean);

					if (attrsParts.length === 0) {
						return svg;
					}

					const attrsString = " " + attrsParts.join(" ");
					return svg.replace("<svg", `<svg${attrsString}`);
				};

				// --- handle the single-icon vs conditional cases ---

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

					// icon1
					const [p1Raw, n1Raw] = icon1.split(":");
					const prefix1 = p1Raw?.replaceAll(`'`, "").replaceAll(`"`, "");
					const name1 = n1Raw?.replaceAll(`'`, "").replaceAll(`"`, "");

					// icon2
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

					// Attach attrs + v-if / v-else directly on the SVGs
					const svg1 = addAttrsToSvg(svgContent1, `v-if="${condition}"`);
					const svg2 = addAttrsToSvg(svgContent2, "v-else");

					const replacement = `${svg1}${svg2}`;

					transformedCode = transformedCode.replace(fullMatch, replacement);
				}
			}

			return transformedCode;
		},
	};
}
