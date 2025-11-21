#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */

import { cp } from "node:fs/promises"; 



const main = async () => {
    const assets = [
        "LICENSE",
        "README.md",
        'tsconfig.json',   
    ]

    try {
        for (const asset of assets) {
            await cp(asset, `dist/${asset}`)
        }
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    // copy nuxt readme
    try {
        await cp('./nuxt/README.md', 'dist/nuxt/README.md')
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    


}; 


if (import.meta.main) {
    await main();
} 

export default main