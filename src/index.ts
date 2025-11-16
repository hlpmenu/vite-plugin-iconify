import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "vite";
import { parseAttributes, buildSvgUrl, fetchSvg } from "./utils";
import transformReact from "./transform_react";

const pluginName = "[vite-plugin-iconify] ";

type IconBindingResult =
	| { type: "single"; icon: string }
	| { type: "conditional"; condition: string; icons: [string, string] };

/**
 * Remove outermost wrapping parentheses when they wrap the entire expression,
 * e.g. "(a ? 'x' : 'y')" -> "a ? 'x' : 'y'"
 *       "('mdi:github')" -> "'mdi:github'"
 */
function stripOuterParens(expr: string): string {
	let s = expr.trim();

	const isWrappedOnce = (str: string): boolean => {
		if (!str.startsWith("(") || !str.endsWith(")")) return false;
		let depth = 0;
		for (let i = 0; i < str.length; i++) {
			const ch = str[i];
			if (ch === "(") depth++;
			else if (ch === ")") depth--;

			// if we close the outermost paren before the last char,
			// it's not a single wrapping pair
			if (depth === 0 && i < str.length - 1) return false;
			if (depth < 0) return false;
		}
		return depth === 0;
	};

	while (s.startsWith("(") && s.endsWith(")") && isWrappedOnce(s)) {
		s = s.slice(1, -1).trim();
	}

	return s;
}

/**
 * Parse a :icon / v-bind:icon expression into something we can statically handle.
 *
 * Supports:
 *   :icon="'mdi:github'"
 *   :icon="\"mdi:github\""
 *   :icon="a ? 'mdi:github' : 'mdi:github-face'"
 *   :icon="('mdi:github')"
 *   :icon="(a ? 'mdi:github' : 'mdi:github-face')"
 */
function parseIconBinding(
	bindingExpr: string | undefined,
): IconBindingResult | null {
	if (!bindingExpr) return null;

	// strip any outer wrapping parentheses first
	const expr = stripOuterParens(bindingExpr);

	// 1) Simple literal: `'mdi:github'` or `"mdi:github"`
	const literalMatch = expr.match(/^(['"`])([^'"`]+)\1$/);
	if (literalMatch) {
		return { type: "single", icon: literalMatch[2] };
	}

	// 2) Simple ternary: `condition ? 'mdi:a' : 'mdi:b'`
	const ternaryMatch = expr.match(/^(.*?)\?(.*)$/);
	if (ternaryMatch) {
		let condition = ternaryMatch[1].trim();
		let rest = ternaryMatch[2];

		// also allow the whole ternary part to be wrapped in parens
		rest = stripOuterParens(rest);

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
		enforce: "pre",

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

				let bindingResult: IconBindingResult | null = null;

				if (attributes.icon) {
					bindingResult = {
						type: "single",
						icon: attributes.icon,
					};
				} else {
					const boundExpr =
						attributes[":icon"] ?? attributes["v-bind:icon"] ?? undefined;
					bindingResult = parseIconBinding(boundExpr);
				}

				if (!bindingResult) {
					// leave <Icon> as-is → runtime will handle
					continue;
				}

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

					const replacement = `${svg1}${svg2}`;

					transformedCode = transformedCode.replace(fullMatch, replacement);
				}
			}

			return transformedCode;
		},
	};
}
