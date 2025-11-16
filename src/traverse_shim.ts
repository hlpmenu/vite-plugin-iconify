import _traverse from "@babel/traverse";

const getTraverse = () => {
	try {
		if (isBun()) {
			return _traverse;
		} else if (
			typeof _traverse !== "function" &&
			_traverse?.default && // @ts-ignore
			typeof _traverse?.default !== "undefined" // @ts-ignore
		) {
			return _traverse.default; // @ts-ignore
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

const isBun = () => {
	try {
		if (typeof Bun !== "undefined" && typeof Bun.file !== "undefined") {
			return true;
		}
	} catch {}
	return false;
};

export default getTraverse();
