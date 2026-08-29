import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { ARCHIVE_NAME, RUNTIME_FILES, verifyRuntimeTree } from "./runtime-files.js";

const archivePath = resolve(ARCHIVE_NAME);
const sourceInfo = JSON.parse(readFileSync("Info.json", "utf8"));

function runUnzip(args) {
    const result = spawnSync("unzip", args, { encoding: "utf8" });
    if (result.status !== 0) {
        console.error(result.stderr || `unzip ${args.join(" ")} failed.`);
        process.exit(result.status || 1);
    }
    return result.stdout;
}

const archiveFiles = runUnzip(["-Z1", archivePath])
    .split("\n")
    .map(value => value.trim())
    .filter(Boolean);

let ok = true;
for (const file of archiveFiles) {
    if (file.startsWith("/") || file.includes("\\") || file.split("/").includes("..")) {
        console.error(`Plugin archive contains an unsafe path: ${file}`);
        ok = false;
    }
}

const actualFiles = [...archiveFiles].sort();
if (new Set(actualFiles).size !== actualFiles.length) {
    console.error("Plugin archive contains duplicate paths.");
    ok = false;
}
if (JSON.stringify(actualFiles) !== JSON.stringify(RUNTIME_FILES)) {
    console.error("Plugin archive contents do not match the runtime allowlist.");
    console.error(`Expected: ${RUNTIME_FILES.join(", ")}`);
    console.error(`Actual: ${actualFiles.join(", ")}`);
    ok = false;
}

if (!ok) {
    process.exit(1);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jellyfin-iina-archive-"));
try {
    runUnzip(["-q", archivePath, "-d", temporaryDirectory]);
    const pluginInfo = verifyRuntimeTree(temporaryDirectory, ARCHIVE_NAME);
    if (JSON.stringify(pluginInfo) !== JSON.stringify(sourceInfo)) {
        throw new Error("Archived Info.json does not match the source manifest.");
    }
    console.log(`Verified ${archivePath} (${pluginInfo.identifier} ${pluginInfo.version}).`);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
}
