#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */

import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

function ensureGeneratedExists(): boolean {
    const file = 'packages/cli/src/generated/git-commit.ts';
    if (!existsSync(file)) {
        console.error(`   Run: bun generate:commit-info`);
        return false;
    }
    return true;
}

const runTypecheck = async (dir: string) => {
    if (dir === 'packages/cli' && !ensureGeneratedExists()) {
        return { dir, status: 'skip' as const };
    }
    let result: $.ShellOutput;
    try {
        result = await $`cd ${dir} && bun run typecheck`;
    } catch (e) {
        if (e instanceof $.ShellError) {
            const msg = `${e.stderr} ${e.stdout}`;
            if (msg.includes('Missing script') || msg.includes('Script not found')) {
                console.log(`${dir} has no typecheck script if trigger`);
                return { dir, status: 'skip' as const };
            }
            console.error(`Typecheck failed in: ${dir}\n ${msg}`);
            process.exit(1); // Exit with a failure code
        } else {
            throw e;
        }
    }

    if (result?.exitCode === 0) {
        return { dir, status: 'ok' as const };
    }

    const out = result.text();
    if (out.includes('Missing script') || out.includes('Script not found')) {
        console.log(`${dir} has no typecheck script`);
        return { dir, status: 'skip' as const };
    }

    return { dir, status: 'fail' as const, code: result.exitCode, output: out };
};

const main = async () => {
    const entries = await fs.readdir('packages', { withFileTypes: true });

    const tasks = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => runTypecheck(join('packages', entry.name)));

    const results = await Promise.all(tasks);

    let failed = false;
    for (const r of results) {
        if (r.status === 'ok') {
            console.log(`${r.dir} passed`);
        } else if (r.status === 'skip') {
            console.log(`${r.dir} has no typecheck script`);
        } else {
            console.error(`Error: ${r.dir} failed with exit code ${r.code}`);
            console.error(r.output);
            failed = true;
        }
    }

    if (failed) process.exit(1);

    console.log('All packages typechecked successfully');
};

await main(); 