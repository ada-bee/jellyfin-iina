import { spawnSync } from "node:child_process";

import { BUNDLE_FILES } from "./runtime-files.js";

function runGit(args) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) {
        console.error(result.stderr || `git ${args.join(" ")} failed.`);
        process.exit(result.status || 1);
    }
    return result.stdout.trim();
}

const status = runGit([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    "dist",
    "ui/dist"
]);
const trackedFiles = new Set(runGit(["ls-files", "--", ...BUNDLE_FILES]).split("\n").filter(Boolean));
const missingTrackedFiles = BUNDLE_FILES.filter(file => !trackedFiles.has(file));

if (status || missingTrackedFiles.length > 0) {
    console.error("Freshly built bundles differ from the committed files.");
    if (status) {
        console.error(status);
    }
    for (const file of missingTrackedFiles) {
        console.error(`Bundle is not tracked: ${file}`);
    }
    console.error("Run `bun run build`, review the generated changes, and commit them.");
    process.exit(1);
}

console.log(`Verified ${BUNDLE_FILES.length} committed bundles.`);
