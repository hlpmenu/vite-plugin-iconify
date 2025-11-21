#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */


const npmRegApiUrl = (name: string) => `https://registry.npmjs.org/${name}/latest`;


const main = async () => {
    if (process.argv.length < 3) {
        console.error("Please provide the version as an argument.");
        process.exit(1);
    } 

    const version = process.argv[2];
    await checkVersion(version);
}



const checkVersion = async (input: string) => {
    const pkg = await Bun.file('dist/package.json').json();
    const name = pkg.name;
    const res = await fetch(npmRegApiUrl(name));
    const data = await res.json();
    const version = data.version;

    if (!version) {
        console.error(`Failed to fetch version from ${npmRegApiUrl(name)}`);
        process.exit(1);
    }

    if (Bun.semver.order(input, version) === -1) {
        console.error(`Version mismatch: ${input} is older than ${version}`);
        process.exit(1);
    }

    return;

}

if (import.meta.main) {
    await main();
} 


export default checkVersion; 