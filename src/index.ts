import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "vite";
import { parseAttributes, buildSvgUrl, fetchSvg } from "./utils";
import transformReact from "./transform_react";
import type {
	EvalVal,
	IconBindingResult,
	ImportBinding,
	LocalEnv,
	ModuleEnv,
} from "./types";

// NEW deps:
import { parse as parseSfc } from "@vue/compiler-sfc";
import { parse as babelParse, parseExpression } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFile } from "node:fs/promises";

const pluginName = "[vite-plugin-iconify] ";

/** ──────────────────────────────────────────────────────────────────────────
 *  Parentheses stripping (already in your previous step)
 *  ────────────────────────────────────────────────────────────────────────── */
function stripOuterParens(expr: string): string {
	let s = expr.trim();

	const isWrappedOnce = (str: string): boolean => {
		if (!str.startsWith("(") || !str.endsWith(")")) return false;
		let depth = 0;
		for (let i = 0; i < str.length; i++) {
			const ch = str[i];
			if (ch === "(") depth++;
			else if (ch === ")") depth--;
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

/** ──────────────────────────────────────────────────────────────────────────
 *  Fast-path parser: literal & simple ternary (your existing behavior)
 *  ────────────────────────────────────────────────────────────────────────── */
function parseIconBinding(
	bindingExpr: string | undefined,
): IconBindingResult | null {
	if (!bindingExpr) return null;

	const expr = stripOuterParens(bindingExpr);

	// Literal: 'mdi:github' or "mdi:github"
	const literalMatch = expr.match(/^(['"`])([^'"`]+)\1$/);
	if (literalMatch) {
		return { type: "single", icon: literalMatch[2] };
	}

	// Ternary: condition ? 'a' : 'b'
	const ternaryMatch = expr.match(/^(.*?)\?(.*)$/);
	if (ternaryMatch) {
		const condition = ternaryMatch[1].trim();
		let rest = stripOuterParens(ternaryMatch[2]);

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

	return null;
}

/** ──────────────────────────────────────────────────────────────────────────
 *  Static evaluator (safe, bounded)
 *  - collects top-level consts & imports from the SFC
 *  - can read one-level imported modules to find exported const strings
 *  - evaluates string-y expressions (identifiers, '+', templates, parens, as const)
 *  ────────────────────────────────────────────────────────────────────────── */

const BABEL_PLUGINS: PluginConfig[] = [
	"typescript",
	"jsx",
	"importMeta",
	"topLevelAwait",
];

function parseTsModule(code: string) {
	return babelParse(code, {
		sourceType: "module",
		plugins: BABEL_PLUGINS,
	});
}

function collectLocalEnvFromCode(code: string): LocalEnv {
	const constDecls = new Map<string, t.Expression>();
	const imports = new Map<string, ImportBinding>();

	const ast = parseTsModule(code);

	traverse(ast, {
		ImportDeclaration(path) {
			const source = path.node.source.value;
			for (const s of path.node.specifiers) {
				if (t.isImportSpecifier(s) && t.isIdentifier(s.local)) {
					const local = s.local.name;
					const imported = t.isIdentifier(s.imported)
						? s.imported.name
						: (s.imported as t.StringLiteral).value;
					imports.set(local, { local, imported, source });
				} else if (t.isImportDefaultSpecifier(s)) {
					imports.set(s.local.name, {
						local: s.local.name,
						imported: "default",
						source,
					});
				}
			}
		},
		VariableDeclarator(path) {
			if (
				t.isIdentifier(path.node.id) &&
				path.parent &&
				t.isVariableDeclaration(path.parent) &&
				path.parent.kind === "const" &&
				path.node.init &&
				t.isExpression(path.node.init)
			) {
				constDecls.set(path.node.id.name, path.node.init);
			}
		},
		ExportNamedDeclaration(path) {
			// Also capture: export const foo = '...'
			const decl = path.node.declaration;
			if (decl && t.isVariableDeclaration(decl) && decl.kind === "const") {
				for (const d of decl.declarations) {
					if (t.isIdentifier(d.id) && d.init && t.isExpression(d.init)) {
						constDecls.set(d.id.name, d.init);
					}
				}
			}
		},
	});

	return { constDecls, imports };
}

function collectModuleEnvFromCode(code: string): ModuleEnv {
	const constDecls = new Map<string, t.Expression>();
	const exports = new Map<string, t.Expression>();
	let defaultExport: t.Expression | undefined;

	const ast = parseTsModule(code);

	traverse(ast, {
		VariableDeclarator(path) {
			if (
				t.isIdentifier(path.node.id) &&
				path.parent &&
				t.isVariableDeclaration(path.parent) &&
				path.parent.kind === "const" &&
				path.node.init &&
				t.isExpression(path.node.init)
			) {
				constDecls.set(path.node.id.name, path.node.init);
			}
		},
		ExportNamedDeclaration(path) {
			// export const foo = '...'
			const decl = path.node.declaration;
			if (decl && t.isVariableDeclaration(decl) && decl.kind === "const") {
				for (const d of decl.declarations) {
					if (t.isIdentifier(d.id) && d.init && t.isExpression(d.init)) {
						exports.set(d.id.name, d.init);
					}
				}
			}

			// export { foo } (only if local const exists)
			if (!decl && path.node.specifiers.length > 0 && !path.node.source) {
				for (const s of path.node.specifiers) {
					if (t.isExportSpecifier(s)) {
						const localName = t.isIdentifier(s.local)
							? s.local.name
							: (s.local as t.StringLiteral).value;
						const exportedName = t.isIdentifier(s.exported)
							? s.exported.name
							: (s.exported as t.StringLiteral).value;
						const init = constDecls.get(localName);
						if (init) exports.set(exportedName, init);
					}
				}
			}
		},
		ExportDefaultDeclaration(path) {
			const d = path.node.declaration;
			if (t.isExpression(d)) {
				defaultExport = d;
			} else if (t.isIdentifier(d)) {
				const ref = constDecls.get(d.name);
				if (ref) defaultExport = ref;
			}
		},
	});

	return { constDecls, exports, defaultExport };
}

const STR = (v: string): EvalVal => ({ kind: "string", value: v });
const BOOL = (v: boolean): EvalVal => ({ kind: "boolean", value: v });
const UNKNOWN: EvalVal = { kind: "unknown" };

function isStringVal(v: EvalVal): v is { kind: "string"; value: string } {
	return v.kind === "string";
}
function isBoolVal(v: EvalVal): v is { kind: "boolean"; value: boolean } {
	return v.kind === "boolean";
}

function isStringyLiteral(expr: t.Expression): boolean {
	return t.isStringLiteral(expr) || t.isTemplateLiteral(expr);
}

async function createStaticResolver(
	code: string,
	id: string,
	pluginCtx: any /* PluginContext */,
) {
	const sfc = parseSfc(code, { filename: id });
	const scriptSrc =
		(sfc.descriptor.script?.content ?? "") +
		"\n" +
		(sfc.descriptor.scriptSetup?.content ?? "");

	const localEnv = collectLocalEnvFromCode(scriptSrc);
	const moduleCache = new Map<string, ModuleEnv>();
	const idValueCache = new Map<string, EvalVal>(); // memoization

	const resolveModule = async (source: string): Promise<ModuleEnv | null> => {
		try {
			const resolved = await pluginCtx.resolve(source, id);
			const resolvedId = typeof resolved === "string" ? resolved : resolved?.id;
			if (!resolvedId) return null;

			if (moduleCache.has(resolvedId)) return moduleCache.get(resolvedId)!;

			const modCode = await readFile(resolvedId, "utf8");
			const env = collectModuleEnvFromCode(modCode);
			moduleCache.set(resolvedId, env);
			return env;
		} catch {
			return null;
		}
	};

	const evalInModule = async (
		node: t.Expression,
		modEnv: ModuleEnv,
	): Promise<EvalVal> => {
		const evalIdInModule = async (name: string): Promise<EvalVal> => {
			const local = modEnv.constDecls.get(name);
			if (local) return evalNode(local);
			const exp = modEnv.exports.get(name);
			if (exp) return evalNode(exp);
			return UNKNOWN;
		};

		const evalNode = async (n: t.Expression): Promise<EvalVal> => {
			// unwrap TS "as const" etc.
			if (t.isTSAsExpression(n)) return evalNode(n.expression);
			if (t.isParenthesizedExpression(n)) return evalNode(n.expression);

			if (t.isStringLiteral(n)) return STR(n.value);

			if (t.isTemplateLiteral(n)) {
				let out = "";
				for (let i = 0; i < n.quasis.length; i++) {
					out += n.quasis[i].value.cooked ?? n.quasis[i].value.raw;
					if (i < n.expressions.length) {
						const v = await evalNode(n.expressions[i] as t.Expression);
						if (!isStringVal(v)) return UNKNOWN;
						out += v.value;
					}
				}
				return STR(out);
			}

			if (t.isBinaryExpression(n) && n.operator === "+") {
				const l = await evalNode(n.left as t.Expression);
				const r = await evalNode(n.right as t.Expression);
				if (isStringVal(l) && isStringVal(r)) return STR(l.value + r.value);
				return UNKNOWN;
			}

			if (t.isBooleanLiteral(n)) return BOOL(n.value);

			if (t.isIdentifier(n)) {
				return evalIdInModule(n.name);
			}

			return UNKNOWN;
		};

		return evalNode(node);
	};

	const evalIdentifier = async (name: string): Promise<EvalVal> => {
		if (idValueCache.has(name)) return idValueCache.get(name)!;

		// Local const
		const local = localEnv.constDecls.get(name);
		if (local) {
			const v = await evalNode(local);
			idValueCache.set(name, v);
			return v;
		}

		// Imported const
		const imp = localEnv.imports.get(name);
		if (imp) {
			const mod = await resolveModule(imp.source);
			if (!mod) return UNKNOWN;

			if (imp.imported === "default") {
				if (mod.defaultExport) {
					const v = await evalInModule(mod.defaultExport, mod);
					idValueCache.set(name, v);
					return v;
				}
				return UNKNOWN;
			} else {
				const exp = mod.exports.get(imp.imported);
				if (exp) {
					const v = await evalInModule(exp, mod);
					idValueCache.set(name, v);
					return v;
				}
				return UNKNOWN;
			}
		}

		return UNKNOWN;
	};

	const evalBool = async (n: t.Expression): Promise<EvalVal> => {
		if (t.isTSAsExpression(n)) return evalBool(n.expression);
		if (t.isParenthesizedExpression(n)) return evalBool(n.expression);

		if (t.isBooleanLiteral(n)) return BOOL(n.value);
		if (t.isIdentifier(n)) {
			const v = await evalIdentifier(n.name);
			if (isBoolVal(v)) return v;
			return UNKNOWN;
		}

		if (t.isUnaryExpression(n) && n.operator === "!") {
			const v = await evalBool(n.argument as t.Expression);
			if (isBoolVal(v)) return BOOL(!v.value);
			return UNKNOWN;
		}

		if (t.isLogicalExpression(n)) {
			// Only evaluate if both sides are booleans
			const l = await evalBool(n.left as t.Expression);
			const r = await evalBool(n.right as t.Expression);
			if (isBoolVal(l) && isBoolVal(r)) {
				switch (n.operator) {
					case "&&":
						return BOOL(l.value && r.value);
					case "||":
						return BOOL(l.value || r.value);
					default:
						return UNKNOWN;
				}
			}
		}

		return UNKNOWN;
	};

	const evalNode = async (node: t.Expression): Promise<EvalVal> => {
		// unwrap TS as const, parentheses
		if (t.isTSAsExpression(node)) return evalNode(node.expression);
		if (t.isParenthesizedExpression(node)) return evalNode(node.expression);

		if (t.isStringLiteral(node)) return STR(node.value);

		if (t.isTemplateLiteral(node)) {
			let out = "";
			for (let i = 0; i < node.quasis.length; i++) {
				out += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
				if (i < node.expressions.length) {
					const v = await evalNode(node.expressions[i] as t.Expression);
					if (!isStringVal(v)) return UNKNOWN;
					out += v.value;
				}
			}
			return STR(out);
		}

		if (t.isBinaryExpression(node) && node.operator === "+") {
			const l = await evalNode(node.left as t.Expression);
			const r = await evalNode(node.right as t.Expression);
			if (isStringVal(l) && isStringVal(r)) return STR(l.value + r.value);
			return UNKNOWN;
		}

		if (t.isIdentifier(node)) {
			return evalIdentifier(node.name);
		}

		if (t.isConditionalExpression(node)) {
			// If condition reduces to boolean, return chosen branch
			const cond = await evalBool(node.test as t.Expression);
			const c = await evalNode(node.consequent as t.Expression);
			const a = await evalNode(node.alternate as t.Expression);
			if (isBoolVal(cond) && isStringVal(c) && isStringVal(a)) {
				return cond.value ? STR(c.value) : STR(a.value);
			}
			// otherwise unknown – earlier fast path already handles simple ternary with literals
			return UNKNOWN;
		}

		if (t.isBooleanLiteral(node)) return BOOL(node.value);

		return UNKNOWN;
	};

	async function resolveToString(exprCode: string): Promise<string | null> {
		try {
			const astExpr = parseExpression(exprCode, {
				sourceType: "module",
				plugins: BABEL_PLUGINS,
			}) as t.Expression;

			const val = await evalNode(astExpr);
			if (isStringVal(val)) return val.value;
			return null;
		} catch {
			return null;
		}
	}

	return { resolveToString };
}

/** ──────────────────────────────────────────────────────────────────────────
 *  Main plugin
 *  ────────────────────────────────────────────────────────────────────────── */
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
					let svg = svgContent;
					const attrsParts = [
						filteredAttributes.trim().length > 0 ? filteredAttributes : null,
						extra && extra.trim().length > 0 ? extra : null,
					].filter(Boolean);

					if (attrsParts.length === 0) return svg;
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
					transformedCode = transformedCode.replace(
						fullMatch,
						`${svg1}${svg2}`,
					);
				}
			}

			return transformedCode;
		},
	};
}
