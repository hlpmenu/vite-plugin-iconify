#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */


const main = async () => {

    let pkg: any;

    try {
        pkg = await Bun.file('dist/package.json').json();
    } catch (e) {
        console.error("Error reading package.json:", e);
        process.exit(1);
    }



    const getVersion = () => process.argv.includes('--version')
    const getName = () => process.argv.includes('--name')
    const tag = () => process.argv.includes('--tag')

    if (!getVersion() && !getName() && !tag()) {
        console.log(JSON.stringify(pkg));
        return;
    }

    switch (true) {
        case getVersion() && getName() && tag(): 
            console.log("version: ", pkg.version);
            console.log('name: ', pkg.name);
            console.log('tag: ', pkg.version);
            break;
        case getVersion():
            console.log(pkg.version);
            break;
        case getName():
            console.log(pkg.name);
            break;
        case tag():
            console.log(pkg.version);
            break;
        default:
            console.error("Invalid flags provided.");
            process.exit(1);
    }




    
}


if (import.meta.main) {
    await main(); 
} 