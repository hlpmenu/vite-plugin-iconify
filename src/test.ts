import * as parser from "@babel/parser";
import traverse from "./traverse_shim";
import type * as traverseTypes from "babel__traverse"; // @ts-ignore
const code = `function square(n) {
  return n * n;
}`;

const ast = parser.parse(code);
/**
 * @type {traverseType}
 */
traverse(ast, {
	enter(path: traverseTypes.NodePath<t.Identifier>) {
		if (path.isIdentifier({ name: "n" })) {
			path.node.name = "x";
		}
	},
});
