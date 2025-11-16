import type { IconBindingResult } from "./types";

/** -------------------------------------------------------------------------
 *  Parentheses stripping (already in your previous step)
 *  ------------------------------------------------------------------------- */
const stripOuterParens = (expr: string): string => {
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
};

/** -------------------------------------------------------------------------
 *  Fast-path parser: literal & simple ternary (your existing behavior)
 *  ------------------------------------------------------------------------- */
const parseIconBinding = (
	bindingExpr: string | undefined,
): IconBindingResult | null => {
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
};

export { parseIconBinding };
