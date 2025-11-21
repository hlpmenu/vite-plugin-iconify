#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */

import { rm } from "node:fs/promises";


export interface GenerateOptions {
    version: string;
    extraProps?: Record<string, any> | null;
}

const validate = (npmPkg: any) => {

    if (!npmPkg) {
        throw new Error("No package.json found.");
    }

    const npmPkgName = npmPkg.name as string;
    if (!npmPkgName.startsWith("@hlmpn")) {
        throw new Error("Package name must start with '@hlmpn, wrong scope.");
    }

    if (!npmPkg.name) {
        throw new Error("No name found in package.json.");
    }
    if (!npmPkg.version) {
        throw new Error("No version found in package.json.");
    }
    if (!npmPkg.exports) {
        throw new Error("No description found in package.json.");
    }
    const npmPkgVersion = npmPkg.version as string;
    if (!npmPkgVersion.startsWith("v")) {
        throw new Error("Version must start with 'v'.");
    }

}


const getLatestGitTag = async (): Promise<string> => {

    if (process.env.GIT_TAG) {
        return process.env.GIT_TAG.trim();
    }

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




const generate = async (opts?: GenerateOptions) => {

    let version: string;
    try {
        const gitTag = await getLatestGitTag();
        if (!gitTag && !opts?.version) {
            throw new Error("No git tag found and no version provided.");
        }
        switch (true) {
            // 1. Local version is older than git tag
            case opts?.version && gitTag && Bun.semver.order(opts.version.replace(/^v/, ''), gitTag.replace(/^v/, '')) === -1:
                throw new Error(`Version mismatch: ${opts.version} is older than tag ${gitTag}`);

            // 2. No version source found
            case !opts?.version && !gitTag:
                throw new Error("No version provided in options or git tags");

            // 3. Only options version exists
            case !!opts?.version && !gitTag:
                version = opts.version;
                console.log(`version: ${version} (from options)`);
                break;

            // 4. Only git tag exists
            case !opts?.version && !!gitTag:
                version = gitTag;
                console.log(`version: ${version} (from git tag)`);
                break;

            // 5. Both exist (Local >= Tag)
            default:
                version = opts!.version!;
                console.log(`version: ${version} (from options)`);
                break;
        }


    } catch (e) {
        throw new Error(
            `Error getting latest git tag: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    let rootpkg: any;

    try {
        const rootPkgJsonString = await Bun.file("./package.json").text();
        if (!rootPkgJsonString) throw new Error("Failed to read root package.json");
        rootpkg = JSON.parse(rootPkgJsonString);
    } catch (e) {
        throw new Error(
            `Error reading root package.json: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    if (!rootpkg) {
        throw new Error("Root package.json is empty or invalid.");
    }

    let npmPkg: any;

    try {
        const npmPkgJsonString = await Bun.file("./package.npm.json").text();
        if (!npmPkgJsonString) throw new Error("Failed to read npm package.json");
        npmPkg = JSON.parse(npmPkgJsonString);
    } catch (e) {
        throw new Error(
            `Error reading npm package.json: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
    if (!npmPkg) {
        throw new Error("NPM package.json is empty or invalid.");
    }

    if (npmPkg?.dependencies) {
        delete npmPkg.dependencies;
    }
    if (npmPkg?.optionalDependencies) {
        delete npmPkg.optionalDependencies;
    }
    if (npmPkg?.peerDependencies) {
        delete npmPkg.peerDependencies;
    }
    if (npmPkg?.devDependencies) {
        delete npmPkg.devDependencies;
    }
    

    if (rootpkg.dependencies) {
        npmPkg.dependencies = rootpkg.dependencies;
    }   
    if (rootpkg.optionalDependencies) {
        npmPkg.optionalDependencies = rootpkg.optionalDependencies;
    }
   
    if (rootpkg.peerDependencies) {
        npmPkg.peerDependencies = rootpkg.peerDependencies;
    }


    npmPkg.version = version;

    try {

        if (opts && opts?.extraProps) {
            Object.assign(npmPkg, opts.extraProps);
        }
    } catch (e) {
        throw new Error(
            `Error updating npm package.json: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    try {
        await rm("dist/package.json", { force: true });
    } catch { }

    try {
        validate(npmPkg);
    } catch (e) {
        throw new Error(
            `Error validating npm package.json: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    try {
        await Bun.write("dist/package.json", JSON.stringify(npmPkg, null, 2));
    } catch (e) {
        throw new Error(
            `Error writing npm package.json: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    console.log("Package.json generated successfully.");






};


const main = async () => {
    const latestTag = await getLatestGitTag();
    await generate({ version: latestTag });
};

if (import.meta.main) {
    await main();
}

export {
    main,
    getLatestGitTag
}

export default generate;
