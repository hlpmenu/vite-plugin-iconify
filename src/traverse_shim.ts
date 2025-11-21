import _traverse from "@babel/traverse";

const getTraverse = () => {
	try {
		if (typeof _traverse === "function") {
			return _traverse;
		} else if (
			typeof _traverse !== "function" &&
			// @ts-expect-error: runtime interop
			_traverse?.default && // @ts-ignore
			typeof _traverse?.default !== "undefined" && // @ts-ignore
			typeof _traverse?.default === "function"
		) {
			// @ts-expect-error: runtime interop
			return _traverse.default;
		} else {
			throw new Error("Cannot find traverse");
		}
	} catch (e) {
		if (e instanceof Error && !e.message.includes("Cannot find traverse")) {
			throw e;
		}
	}
	return undefined;
};

// oxlint-disable-next-line eslint/no-unused-vars
const isBun = () => {
	try {
		// @ts-expect-error: runtime interop
		if (typeof Bun !== "undefined" && typeof Bun.file !== "undefined") {
			return true;
		}
	} catch {}
	return false;
};

export default getTraverse();
