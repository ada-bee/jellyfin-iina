import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    unlinkSync,
    utimesSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { ARCHIVE_NAME, RUNTIME_FILES, verifyRuntimeTree } from "./runtime-files.js";

const sourceDirectory = resolve(".");
const outputPath = resolve(ARCHIVE_NAME);
const normalizedTimestamp = new Date("2000-01-01T00:00:00Z");

try {
    verifyRuntimeTree(sourceDirectory, "repository root");
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jellyfin-iina-package-"));
try {
    for (const file of RUNTIME_FILES) {
        const sourcePath = join(sourceDirectory, file);
        const temporaryPath = join(temporaryDirectory, file);
        mkdirSync(dirname(temporaryPath), { recursive: true });
        cpSync(sourcePath, temporaryPath);
        utimesSync(temporaryPath, normalizedTimestamp, normalizedTimestamp);
    }

    if (existsSync(outputPath)) {
        unlinkSync(outputPath);
    }

    const result = spawnSync("zip", ["-X", "-q", outputPath, ...RUNTIME_FILES], {
        cwd: temporaryDirectory,
        env: { ...process.env, TZ: "UTC" },
        encoding: "utf8"
    });
    if (result.status !== 0) {
        throw new Error(result.stderr || "Failed to create plugin archive with zip.");
    }
} finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`Created ${outputPath} with ${RUNTIME_FILES.length} allowlisted runtime files.`);
