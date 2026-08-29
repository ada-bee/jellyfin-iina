import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

const archivePath = resolve("xyz.brbc.jellyfin.iinaplugin.iinaplgz");
const pluginInfo = JSON.parse(readFileSync("xyz.brbc.jellyfin.iinaplugin/Info.json", "utf8"));

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

const requiredFiles = [
    "Info.json",
    pluginInfo.entry,
    pluginInfo.globalEntry,
    pluginInfo.preferencesPage,
    "ui/sidebar.html",
    "ui/sidebar.css",
    "ui/dist/sidebar.js"
];

let ok = true;
for (const file of requiredFiles) {
    if (!archiveFiles.includes(file)) {
        console.error(`Plugin archive is missing ${file}.`);
        ok = false;
    }
}

for (const file of archiveFiles) {
    if (file.startsWith("/") || file.split("/").includes("..")) {
        console.error(`Plugin archive contains an unsafe path: ${file}`);
        ok = false;
    }
}

const archivedInfo = JSON.parse(runUnzip(["-p", archivePath, "Info.json"]));
for (const key of ["identifier", "version", "ghVersion"]) {
    if (archivedInfo[key] !== pluginInfo[key]) {
        console.error(`Archived Info.json ${key} does not match the source manifest.`);
        ok = false;
    }
}

if (!ok) {
    process.exit(1);
}

console.log(`Verified ${archivePath} (${pluginInfo.identifier} ${pluginInfo.version}).`);
