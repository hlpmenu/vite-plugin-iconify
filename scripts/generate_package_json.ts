
export interface GenerateOptions {
    version: string;
    extraProps?: Record<string, any>;
}


const getLatestGitTag = async (): Promise<string> => {
    const gitProc = Bun.spawn(["git", "describe", "--tags", "--abbrev=0"], {
        stdout: "pipe",
        stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
        gitProc.exited,
        new Response(gitProc.stdout).text(),
        new Response(gitProc.stderr).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(
            `Failed to get latest git tag: ${stderr.trim() || `exit code ${exitCode}`}`,
        );
    }

    const tag = stdout.trim();
    if (!tag) {
        throw new Error("No git tags found.");
    }

    return tag;
};




const generate = async (opts: GenerateOptions) => {

    let rootpkg: any;

    try {
        const rootPkgJsonString = await Bun.file("./package.json").text();
        if (!rootPkgJsonString) throw new Error("Failed to read root package.json");
        rootpkg = JSON.parse(rootPkgJsonString);
    } catch (e) {
        console.error("Error reading root package.json:", e);
        process.exit(1);
    }

    if (!rootpkg) {
        console.error("Root package.json is empty or invalid.");
        process.exit(1);
    }

    let npmPkg: any;

    try {
        const npmPkgJsonString = await Bun.file("./package.npm.json").text();
        if (!npmPkgJsonString) throw new Error("Failed to read npm package.json");
        npmPkg = JSON.parse(npmPkgJsonString);
    } catch (e) {
        console.error("Error reading npm package.json:", e);
        process.exit(1);
    }
    if (!npmPkg) {
        console.error("NPM package.json is empty or invalid.");
        process.exit(1);
    }

    if (rootpkg.dependencies) {
        npmPkg.dependencies = rootpkg.dependencies;
    }   
    if (rootpkg.devDependencies) {
        npmPkg.devDependencies = rootpkg.devDependencies;
    }   
    if (rootpkg.peerDependencies) {
        npmPkg.peerDependencies = rootpkg.peerDependencies;
    }








};


const main = async () => {
    const latestTag = await getLatestGitTag();
    console.log("Latest git tag:", latestTag);
};

if (import.meta.main) {
    main();
}

export default generate;
