import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { verifyRuntimeTree } from "./runtime-files.js";

function run(command, args) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr || `${command} ${args.join(" ")} failed.`);
    }
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "jellyfin-iina-source-"));
const archivePath = join(temporaryDirectory, "source.tar");
const sourceRoot = join(temporaryDirectory, "source");

try {
    mkdirSync(sourceRoot);
    run("git", ["archive", "--format=tar", `--output=${archivePath}`, "HEAD"]);
    run("tar", ["-xf", archivePath, "-C", sourceRoot]);
    const manifest = verifyRuntimeTree(sourceRoot, "git archive HEAD");
    console.log(`Verified installable git archive HEAD (${manifest.identifier} ${manifest.version}).`);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
}
