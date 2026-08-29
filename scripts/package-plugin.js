import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    unlinkSync,
    utimesSync
} from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { spawnSync } from "child_process";

const sourceDirectory = resolve("xyz.brbc.jellyfin.iinaplugin");
const outputPath = resolve("xyz.brbc.jellyfin.iinaplugin.iinaplgz");
const normalizedTimestamp = new Date("2000-01-01T00:00:00Z");

function listFiles(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
        .flatMap(entry => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? listFiles(path) : [relative(sourceDirectory, path)];
        });
}

const files = listFiles(sourceDirectory);
if (files.length === 0) {
    console.error(`No plugin files found in ${sourceDirectory}.`);
    process.exit(1);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jellyfin-iina-package-"));
try {
    for (const file of files) {
        const sourcePath = join(sourceDirectory, file);
        const temporaryPath = join(temporaryDirectory, file);
        mkdirSync(dirname(temporaryPath), { recursive: true });
        cpSync(sourcePath, temporaryPath);
        utimesSync(temporaryPath, normalizedTimestamp, normalizedTimestamp);
    }

    if (existsSync(outputPath)) {
        unlinkSync(outputPath);
    }

    const result = spawnSync("zip", ["-X", "-q", outputPath, ...files], {
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

console.log(`Created ${outputPath} with ${files.length} files.`);
