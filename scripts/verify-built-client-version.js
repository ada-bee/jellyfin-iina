import { existsSync, readFileSync } from "node:fs";

const infoPath = "Info.json";
const infoRaw = readFileSync(infoPath, "utf8");
const info = JSON.parse(infoRaw);

if (typeof info.version !== "string" || info.version.trim() === "") {
    console.error("Missing or invalid version in Info.json.");
    process.exit(1);
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`version\\s*:\\s*"${escapeRegExp(info.version)}"`);

const files = [
    { path: "dist/main.js", includesVersion: true },
    { path: "dist/global.js", includesVersion: true },
    { path: "ui/dist/sidebar.js", includesVersion: true },
    { path: "ui/dist/overlay.js", includesVersion: false }
];

let ok = true;

for (const file of files) {
    if (!existsSync(file.path)) {
        console.error(`Missing build output: ${file.path}`);
        ok = false;
        continue;
    }

    const content = readFileSync(file.path, "utf8");
    if (file.includesVersion && !pattern.test(content)) {
        console.error(`Version mismatch in ${file.path}; expected ${info.version}`);
        ok = false;
    }
}

if (!ok) {
    process.exit(1);
}

console.log(`Client version ${info.version} found in built outputs.`);
