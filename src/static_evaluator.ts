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

const STR = (v: string): EvalVal => ({ kind: "string", value: v });
const BOOL = (v: boolean): EvalVal => ({ kind: "boolean", value: v });
const UNKNOWN: EvalVal = { kind: "unknown" };

const isStringVal = (v: EvalVal): v is { kind: "string"; value: string } =>
	v.kind === "string";
const isBoolVal = (v: EvalVal): v is { kind: "boolean"; value: boolean } =>
	v.kind === "boolean";

const isStringyLiteral = (expr: t.Expression): boolean =>
	t.isStringLiteral(expr) || t.isTemplateLiteral(expr);

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

		const local = localEnv.constDecls.get(name);
		if (local) {
			const v = await evalNode(local);
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
			const cond = await evalBool(node.test as t.Expression);
			const c = await evalNode(node.consequent as t.Expression);
			const a = await evalNode(node.alternate as t.Expression);
			if (isBoolVal(cond) && isStringVal(c) && isStringVal(a)) {
				return cond.value ? STR(c.value) : STR(a.value);
			}
			return UNKNOWN;
		}

		if (t.isBooleanLiteral(node)) return BOOL(node.value);

		return UNKNOWN;
	};

	const resolveToString = async (exprCode: string): Promise<string | null> => {
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
	};

	return { resolveToString };
};

export { createStaticResolver };
