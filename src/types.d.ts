import type * as t from "@babel/types";

export type IconBindingResult =
	| { type: "single"; icon: string }
	| { type: "conditional"; condition: string; icons: [string, string] };

export interface ImportBinding {
	local: string;
	imported: "default" | string;
	source: string;
}

export interface LocalEnv {
	constDecls: Map<string, t.Expression>;
	imports: Map<string, ImportBinding>;
}

export interface ModuleEnv {
	constDecls: Map<string, t.Expression>;
	exports: Map<string, t.Expression>;
	defaultExport?: t.Expression;
}

export type EvalVal =
	| { kind: "string"; value: string }
	| { kind: "boolean"; value: boolean }
	| { kind: "unknown" };
