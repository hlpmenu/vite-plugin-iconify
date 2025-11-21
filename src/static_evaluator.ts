import { parse as parseSfc } from "@vue/compiler-sfc";
import {
	parse as babelParse,
	parseExpression,
	type ParserPluginWithOptions,
} from "@babel/parser";
import traverse from "./traverse_shim";
import type * as traverseTypes from "babel__traverse"; // @ts-ignore
import * as t from "@babel/types";
import { readFile } from "node:fs/promises";
import type { EvalVal, ImportBinding, LocalEnv, ModuleEnv } from "./types";

const BABEL_PLUGINS: any[] = [
	"typescript",
	"jsx",
	"importMeta",
	"topLevelAwait",
] as unknown as ParserPluginWithOptions[];

const parseTsModule = (code: string) =>
	babelParse(code, {
		sourceType: "module",
		plugins: BABEL_PLUGINS,
	});

const collectLocalEnvFromCode = (code: string): LocalEnv => {
	const constDecls = new Map<string, t.Expression>();
	const imports = new Map<string, ImportBinding>();

	const ast = parseTsModule(code);

	traverse(ast, {
		ImportDeclaration(path: traverseTypes.NodePath<t.ImportDeclaration>) {
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
		VariableDeclarator(path: traverseTypes.NodePath<t.VariableDeclarator>) {
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
		ExportNamedDeclaration(
			path: traverseTypes.NodePath<t.ExportNamedDeclaration>,
		) {
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
};

const collectModuleEnvFromCode = (code: string): ModuleEnv => {
	const constDecls = new Map<string, t.Expression>();
	const exports = new Map<string, t.Expression>();
	let defaultExport: t.Expression | undefined;

	const ast = parseTsModule(code);

	traverse(ast, {
		VariableDeclarator(path: traverseTypes.NodePath<t.VariableDeclarator>) {
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
		ExportNamedDeclaration(
			path: traverseTypes.NodePath<t.ExportNamedDeclaration>,
		) {
			const decl = path.node.declaration;
			if (decl && t.isVariableDeclaration(decl) && decl.kind === "const") {
				for (const d of decl.declarations) {
					if (t.isIdentifier(d.id) && d.init && t.isExpression(d.init)) {
						exports.set(d.id.name, d.init);
					}
				}
			}

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
		ExportDefaultDeclaration(
			path: traverseTypes.NodePath<t.ExportDefaultDeclaration>,
		) {
			const d = path.node.declaration;

			if (t.isIdentifier(d)) {
				const ref = constDecls.get(d.name);
				if (ref) {
					defaultExport = ref;
					return;
				}
			}

			if (t.isExpression(d)) {
				defaultExport = d;
			}
		},
	});

	return { constDecls, exports, defaultExport };
};

// --- HELPERS ---
const STR = (v: string): EvalVal => ({ kind: "string", value: v });
const BOOL = (v: boolean): EvalVal => ({ kind: "boolean", value: v });
const NUM = (v: number): EvalVal => ({ kind: "number", value: v });
const NULL: EvalVal = { kind: "null" };
const UNDEF: EvalVal = { kind: "undefined" };
const UNKNOWN: EvalVal = { kind: "unknown" };

const createStaticResolver = async (
	code: string,
	id: string,
	pluginCtx: any,
) => {
	const sfc = parseSfc(code, { filename: id });
	const scriptSrc =
		(sfc.descriptor.script?.content ?? "") +
		"\n" +
		(sfc.descriptor.scriptSetup?.content ?? "");

	const localEnv = collectLocalEnvFromCode(scriptSrc);
	const moduleCache = new Map<string, ModuleEnv>();
	const idValueCache = new Map<string, EvalVal>();

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
		node: t.Expression | t.SpreadElement | null,
		modEnv: ModuleEnv | LocalEnv,
	): Promise<EvalVal> => {
		const evalIdInModule = async (name: string): Promise<EvalVal> => {
			const local = modEnv.constDecls.get(name);
			if (local) return evalNode(local);

			if ("exports" in modEnv) {
				const exp = modEnv.exports.get(name);
				if (exp) return evalNode(exp);
			}
			return UNKNOWN;
		};

		const evalNode = async (
			n: t.Expression | t.SpreadElement | null,
		): Promise<EvalVal> => {
			if (!n) return UNDEF;

			// 1. Wrappers
			if (t.isTSAsExpression(n)) return evalNode(n.expression);
			if (t.isParenthesizedExpression(n)) return evalNode(n.expression);

			// 2. Primitives
			if (t.isStringLiteral(n)) return STR(n.value);
			if (t.isBooleanLiteral(n)) return BOOL(n.value);
			if (t.isNumericLiteral(n)) return NUM(n.value);
			if (t.isNullLiteral(n)) return NULL;
			if (t.isIdentifier(n)) {
				if (n.name === "undefined") return UNDEF;
				return evalIdInModule(n.name);
			}

			// 3. Template Literals
			if (t.isTemplateLiteral(n)) {
				let out = "";
				for (let i = 0; i < n.quasis.length; i++) {
					out += n.quasis[i].value.cooked ?? n.quasis[i].value.raw;
					if (i < n.expressions.length) {
						const v = await evalNode(n.expressions[i] as t.Expression);
						if (v.kind !== "string") return UNKNOWN;
						out += v.value;
					}
				}
				return STR(out);
			}

			// 4. Binary Expression (+)
			if (t.isBinaryExpression(n) && n.operator === "+") {
				const l = await evalNode(n.left as t.Expression);
				const r = await evalNode(n.right as t.Expression);
				if (l.kind === "string" && r.kind === "string")
					return STR(l.value + r.value);
				return UNKNOWN;
			}

			// 5. Logical Expressions (?? and ||)
			if (t.isLogicalExpression(n)) {
				const left = await evalNode(n.left as t.Expression);

				if (n.operator === "??") {
					if (
						left.kind !== "null" &&
						left.kind !== "undefined" &&
						left.kind !== "unknown"
					)
						return left;
					if (left.kind === "unknown") return UNKNOWN;
				}

				if (n.operator === "||") {
					const isTruthy =
						(left.kind === "string" && left.value !== "") ||
						(left.kind === "boolean" && left.value) ||
						(left.kind === "number" && left.value !== 0);
					if (isTruthy) return left;
					if (left.kind === "unknown") return UNKNOWN;
				}

				return evalNode(n.right as t.Expression);
			}

			// 6. Arrays
			if (t.isArrayExpression(n)) {
				const values: EvalVal[] = [];
				for (const el of n.elements) {
					if (!el) continue; // sparse
					if (t.isSpreadElement(el)) return UNKNOWN;
					values.push(await evalNode(el as t.Expression));
				}
				return { kind: "array", values };
			}

			// 7. Objects
			if (t.isObjectExpression(n)) {
				const values: Record<string, EvalVal> = {};
				for (const prop of n.properties) {
					if (t.isObjectProperty(prop)) {
						let key: string | null = null;
						if (t.isIdentifier(prop.key) && !prop.computed) key = prop.key.name;
						else if (t.isStringLiteral(prop.key)) key = prop.key.value;

						if (key && t.isExpression(prop.value)) {
							values[key] = await evalNode(prop.value);
						}
					} else {
						return UNKNOWN; // spread or method
					}
				}
				return { kind: "object", values };
			}

			// 8. Member Access (obj.key, arr[0])
			if (t.isMemberExpression(n)) {
				const obj = await evalNode(n.object as t.Expression);

				let key: string | number | null = null;
				if (n.computed) {
					const k = await evalNode(n.property as t.Expression);
					if (k.kind === "string") key = k.value;
					if (k.kind === "number") key = k.value;
				} else if (t.isIdentifier(n.property)) {
					key = n.property.name;
				}

				if (obj.kind === "object" && typeof key === "string") {
					return obj.values[key] ?? UNDEF;
				}
				if (obj.kind === "array" && typeof key === "number") {
					return obj.values[key] ?? UNDEF;
				}
				return UNKNOWN;
			}

			// 9. Call Expressions (Functions, Methods, Refs)
			if (t.isCallExpression(n)) {
				// A. Function Calls (Ref, Computed, or Local Functions)
				if (t.isIdentifier(n.callee)) {
					const name = n.callee.name;

					// Built-in Vue helpers
					if (
						["ref", "computed", "unref", "readonly"].includes(name) &&
						n.arguments.length > 0
					) {
						const arg = n.arguments[0];
						// Unwrap arrow function in computed(() => ...)
						if (t.isArrowFunctionExpression(arg) && t.isExpression(arg.body)) {
							return evalNode(arg.body);
						}
						if (t.isExpression(arg)) return evalNode(arg);
					}

					// Local Function Call (Simple 0-arg const functions)
					const decl = modEnv.constDecls.get(name);
					if (
						decl &&
						(t.isArrowFunctionExpression(decl) || t.isFunctionExpression(decl))
					) {
						if (decl.params.length === 0) {
							if (t.isBlockStatement(decl.body)) {
								const ret = decl.body.body.find((s) =>
									t.isReturnStatement(s),
								) as t.ReturnStatement;
								if (ret && ret.argument) return evalNode(ret.argument);
							} else if (t.isExpression(decl.body)) {
								return evalNode(decl.body);
							}
						}
					}
				}

				// B. Member Method Calls (.trim, .split, etc)
				if (t.isMemberExpression(n.callee)) {
					const obj = await evalNode(n.callee.object as t.Expression);
					const prop = n.callee.property;

					if (obj.kind === "string" && t.isIdentifier(prop)) {
						if (prop.name === "trim") return STR(obj.value.trim());
						if (prop.name === "toLowerCase")
							return STR(obj.value.toLowerCase());
						if (prop.name === "toUpperCase")
							return STR(obj.value.toUpperCase());
						if (prop.name === "split") {
							const sepArg = n.arguments[0];
							if (sepArg && t.isStringLiteral(sepArg)) {
								const parts = obj.value.split(sepArg.value).map(STR);
								return { kind: "array", values: parts };
							}
						}
					}
				}
			}

			// 10. Conditional (Ternary)
			if (t.isConditionalExpression(n)) {
				const cond = await evalNode(n.test as t.Expression);
				const c = await evalNode(n.consequent as t.Expression);
				const a = await evalNode(n.alternate as t.Expression);

				let isTrue = false;
				if (cond.kind === "boolean") isTrue = cond.value;
				else if (cond.kind === "string") isTrue = cond.value.length > 0;
				else if (cond.kind === "number") isTrue = cond.value !== 0;
				else if (cond.kind === "null" || cond.kind === "undefined")
					isTrue = false;
				else return UNKNOWN;

				return isTrue ? c : a;
			}

			return UNKNOWN;
		};

		return evalNode(node);
	};

	// oxlint-disable-next-line eslint/no-unused-vars
	const evalIdentifier = async (name: string): Promise<EvalVal> => {
		if (idValueCache.has(name)) return idValueCache.get(name)!;

		const local = localEnv.constDecls.get(name);
		if (local) {
			// We pass localEnv here because we are in the same file
			const v = await evalInModule(local, localEnv);
			idValueCache.set(name, v);
			return v;
		}

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

	const resolveToString = async (exprCode: string): Promise<string | null> => {
		try {
			const astExpr = parseExpression(exprCode, {
				sourceType: "module",
				plugins: BABEL_PLUGINS,
			}) as t.Expression;

			// Evaluate using local environment context
			const val = await evalInModule(astExpr, localEnv);

			if (val.kind === "string") return val.value;
			return null;
		} catch {
			return null;
		}
	};

	return { resolveToString };
};

export { createStaticResolver };
