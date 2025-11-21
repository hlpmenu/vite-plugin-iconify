
import { $ } from "bun";
const rootDir = process.cwd();

const runCommand = async (command: string): Promise<string | null> => {
    const res = await $`${command.split(' ')}`
        .env({ ...process.env, FORCE_COLOR: 'true' })
        .cwd(rootDir)
        .nothrow();
    if (res.exitCode !== 0) {
        throw new Error("Typecheck failed: " + res.text());
    }
    return res.text();

}

export default runCommand