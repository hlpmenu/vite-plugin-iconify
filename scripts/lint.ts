#!/usr/bin/env bun

/**
 * @license
 * Copyright 2025 HLMPN AB
 * SPDX-License-Identifier: MIT
 */

import { $ } from 'bun';

type LintName = 'eslint' | 'oxlint';

interface LintResult {
    name: LintName;
    status: 'pass' | 'error';
    exitCode: number;
    output: Uint8Array;
}

const runLint = async (
    name: LintName,
    command: string,
): Promise<LintResult> => {
    try {
        const shell = await $`${command.split(' ')}`
            .quiet()
            .env({ ...process.env, FORCE_COLOR: 'true' })
            .nothrow();

        return {
            name,
            status: shell.exitCode === 0 ? 'pass' : 'error',
            exitCode: shell.exitCode,
            output: await shell.bytes(),
        };
    } catch (error: unknown) {
        // This block handles cases where the shell command itself cannot be initiated.
        const message = error instanceof Error ? error.message : String(error); return {
            name,
            status: 'error',
            exitCode: 1,
            output: new TextEncoder().encode(
                `[lint.ts] Failed to execute command for ${name}: ${message}\n`,),
        };
    }
};

async function main() {
    const args = process.argv.slice(2);

    const recognizedFlags = new Set([
        '--ci',
        '--fix',
        '--debug',
        '--eslint-only',
        '--oxlint-only',
    ]);

    const hasFlag = (flag: string) => args.includes(flag);

    const invalidFlags = args.filter(
        (arg) => arg.startsWith('--') && !recognizedFlags.has(arg),
    );

    if (invalidFlags.length > 0) { console.error(`Unknown flag(s): ${invalidFlags.join(', ')}`);
        process.exit(1);
    }

    const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
    if (positionalArgs.length > 0) {
        console.error(
            `Positional arguments are not supported: ${positionalArgs.join(', ')}`,
        );
        process.exit(1);
    }
    const useCi = hasFlag('--ci');
    const useFix = hasFlag('--fix');
    const useDebug = hasFlag('--debug');

    const rawEslintOnly = hasFlag('--eslint-only');
    const rawOxlintOnly = hasFlag('--oxlint-only');
    if (rawEslintOnly && rawOxlintOnly) {
        console.error('Flags --eslint-only and --oxlint-only cannot be combined.');
        process.exit(1);
    }
    const eslintOnly = rawEslintOnly && !rawOxlintOnly;
    const oxlintOnly = rawOxlintOnly && !rawEslintOnly;

    const modeFlags = [useCi, useFix, useDebug].filter(Boolean);
    if (modeFlags.length > 1) {
        console.error('Flags --ci, --fix, and --debug are mutually exclusive; choose at most one.',
        );
        process.exit(1);
    }

    const runOxlint = !eslintOnly;
    const runEslint = !oxlintOnly;

    const treatWarningsAsErrors = useCi || useDebug;

    const lintTarget = '.';

    const buildEslintCommand = (): string => {
        let command = 'bunx --bun eslint --ext .ts,.tsx';
        if (useFix) {
            command += ' --fix';
        }
        if (treatWarningsAsErrors) {
            command += ' --max-warnings 0';
        }
        if (useDebug) {
            command += ' --debug';
        }
        command += ` ${lintTarget}`;
        return command;
    };

    const buildOxlintCommand = (): string => {
        let command = 'bunx --bun oxlint --type-aware --tsconfig ./tsconfig.json';
        if (useFix) {
            command += ' --fix';
        }
        if (treatWarningsAsErrors) {
            command += ' --max-warnings 0';
        }
        command += ` ${lintTarget}`;
        return command;
    };

    const jobs = [
        { name: 'oxlint', enabled: runOxlint, command: buildOxlintCommand() },
        { name: 'eslint', enabled: runEslint, command: buildEslintCommand() },
    ] as const;

    const activeJobs = jobs.filter((job) => job.enabled);

    if (activeJobs.length === 0) {
        console.error('No lint commands selected.');
        process.exit(1);
    }

    const results = await Promise.all(
        activeJobs.map((job) => runLint(job.name, job.command)),
    );

    const stdErrWriter = Bun.stderr.writer();

    let hasError = false;
    const finalCommandResult: string[] = [];

    for (const result of results) {
        if (result.output.byteLength > 0) {
            await stdErrWriter.write(result.output);
        }

        if (result.status === 'error') {
            hasError = true;
            finalCommandResult.push(`${result.name}: found errors or warnings`);
        } else {
            finalCommandResult.push(`${result.name}: pass`);
        }
    }

    finalCommandResult.forEach((line) => console.log(line));

    if (hasError) {
        process.exit(1);
    }
}

await main(); 