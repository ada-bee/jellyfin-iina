import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export const ARCHIVE_NAME = "xyz.brbc.jellyfin.iinaplugin.iinaplgz";

export const BUNDLE_FILES = [
    "dist/global.js",
    "dist/main.js",
    "ui/dist/overlay.js",
    "ui/dist/sidebar.js"
];

export const RUNTIME_FILES = [
    "Info.json",
    "LICENSE",
    "assets/Jellyfin.png",
    ...BUNDLE_FILES,
    "ui/assets/jellyfin-horizontal.png",
    "ui/assets/jellyfin-icon.png",
    "ui/overlay.css",
    "ui/overlay.html",
    "ui/preferences.html",
    "ui/sidebar.css",
    "ui/sidebar.html"
].sort();

function isSafeRelativePath(path) {
    return typeof path === "string"
        && path.length > 0
        && !isAbsolute(path)
        && !path.includes("\\")
        && path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function readManifest(rootDirectory, errors) {
    try {
        return JSON.parse(readFileSync(resolve(rootDirectory, "Info.json"), "utf8"));
    } catch (error) {
        errors.push(`Info.json is not readable JSON: ${error instanceof Error ? error.message : error}`);
        return null;
    }
}

export function validateManifest(manifest, errors) {
    const requiredStrings = [
        "name",
        "identifier",
        "version",
        "ghRepo",
        "description",
        "entry",
        "globalEntry",
        "preferencesPage"
    ];
    for (const key of requiredStrings) {
        if (!isNonEmptyString(manifest[key])) {
            errors.push(`Info.json is missing a non-empty ${key}.`);
        }
    }

    if (!Number.isInteger(manifest.ghVersion)) {
        errors.push("Info.json is missing an integer ghVersion.");
    }
    if (!isNonEmptyString(manifest.author?.name)) {
        errors.push("Info.json is missing author.name.");
    }
    if (!isNonEmptyString(manifest.sidebarTab?.name)) {
        errors.push("Info.json is missing sidebarTab.name.");
    }
    if (!isNonEmptyArray(manifest.permissions)) {
        errors.push("Info.json is missing permissions.");
    }
    if (!isNonEmptyArray(manifest.allowedDomains)) {
        errors.push("Info.json is missing allowedDomains.");
    }
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}

function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}

function validateRuntimeFile(rootDirectory, file, errors) {
    if (!isSafeRelativePath(file)) {
        errors.push(`Runtime path is unsafe: ${file}`);
        return;
    }

    const root = resolve(rootDirectory);
    const path = resolve(root, file);
    if (!path.startsWith(`${root}${sep}`)) {
        errors.push(`Runtime path escapes the plugin root: ${file}`);
        return;
    }

    try {
        if (!lstatSync(path).isFile()) {
            errors.push(`Runtime path is not a file: ${file}`);
        }
    } catch {
        errors.push(`Runtime file is missing: ${file}`);
    }
}

export function verifyRuntimeTree(rootDirectory, label = rootDirectory) {
    const errors = [];
    const manifest = readManifest(rootDirectory, errors);

    for (const file of RUNTIME_FILES) {
        validateRuntimeFile(rootDirectory, file, errors);
    }

    if (manifest) {
        validateManifest(manifest, errors);
        for (const key of ["entry", "globalEntry", "preferencesPage"]) {
            const path = manifest[key];
            if (typeof path === "string" && !RUNTIME_FILES.includes(path)) {
                errors.push(`Info.json ${key} is not in the packaged runtime allowlist: ${path}`);
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid plugin runtime in ${label}:\n- ${errors.join("\n- ")}`);
    }

    return manifest;
}
