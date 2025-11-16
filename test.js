import traverse from "@babel/traverse";
import { parse } from "@babel/parser";

const main = async () => {
	traverse(
		parse(`
        import { Icon } from 'iconify';
        const a = 1;
        const b = 2;
        const c = 3;
        const d = 4;
        const e = 5;
        const f = 6;
    `),
	);
};

main();
