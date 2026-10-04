import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function releaseVersion(tag) {
    if (typeof tag !== "string" || !RELEASE_TAG.test(tag)) {
        throw new Error(`Expected a stable release tag such as v3.0.0, received ${tag}.`);
    }
    return tag.slice(1);
}

function isNewerVersion(current, previous) {
    const currentParts = current.split(".").map(Number);
    const previousParts = previous.split(".").map(Number);
    for (let index = 0; index < currentParts.length; index += 1) {
        if (currentParts[index] !== previousParts[index]) {
            return currentParts[index] > previousParts[index];
        }
    }
    return false;
}

export function validateReleaseMetadata(manifest, tag, previousManifest, previousTag) {
    const version = releaseVersion(tag);
    const previousVersion = releaseVersion(previousTag);
    if (manifest.version !== version || previousManifest.version !== previousVersion) {
        throw new Error("Release tags must match the version in their Info.json.");
    }
    if (!isNewerVersion(version, previousVersion)) {
        throw new Error(`Release ${tag} must be newer than the published ${previousTag}.`);
    }
    for (const candidate of [manifest, previousManifest]) {
        if (!Number.isSafeInteger(candidate.ghVersion) || candidate.ghVersion < 1) {
            throw new Error("Info.json ghVersion must be a positive integer.");
        }
    }
    if (manifest.ghVersion <= previousManifest.ghVersion) {
        throw new Error(`ghVersion must exceed ${previousManifest.ghVersion} from ${previousTag}.`);
    }
    if (manifest.identifier !== previousManifest.identifier || manifest.ghRepo !== previousManifest.ghRepo) {
        throw new Error("The release must preserve the plugin identifier and ghRepo used by existing installs.");
    }
}

function git(cwd, args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
    }
    return result.stdout.trim();
}

function readTaggedManifest(cwd, tag, identifier) {
    const ref = `refs/tags/${tag}`;
    const paths = git(cwd, [
        "ls-tree", "-r", "--name-only", ref, "--",
        "Info.json", `${identifier}.iinaplugin/Info.json`
    ]).split("\n");
    const path = paths.includes("Info.json") ? "Info.json" : paths[0];
    if (!path) {
        throw new Error(`${tag} does not contain a plugin manifest.`);
    }
    return JSON.parse(git(cwd, ["show", `${ref}:${path}`]));
}

function validateUpdateSource(manifest, mainManifest) {
    if (manifest.identifier !== mainManifest.identifier || !Number.isSafeInteger(mainManifest.ghVersion)) {
        throw new Error("The IINA update manifest on main has invalid release metadata.");
    }
    if (manifest.ghVersion > mainManifest.ghVersion) {
        return;
    }
    if (manifest.ghVersion !== mainManifest.ghVersion || manifest.version !== mainManifest.version) {
        throw new Error("Release ghVersion must exceed main, or main must already advertise this release.");
    }
}

export function verifyRelease({ tag, previousTag, cwd = process.cwd(), mainRef = "origin/main", repository }) {
    releaseVersion(tag);
    releaseVersion(previousTag);
    const manifest = JSON.parse(readFileSync(resolve(cwd, "Info.json"), "utf8"));
    const previousManifest = readTaggedManifest(cwd, previousTag, manifest.identifier);
    validateReleaseMetadata(manifest, tag, previousManifest, previousTag);
    validateUpdateSource(manifest, JSON.parse(git(cwd, ["show", `${mainRef}:Info.json`])));
    if (repository && manifest.ghRepo !== repository) {
        throw new Error("Info.json ghRepo does not match the release repository.");
    }

    const commit = git(cwd, ["rev-parse", `refs/tags/${tag}^{commit}`]);
    if (git(cwd, ["rev-parse", "HEAD"]) !== commit) {
        throw new Error(`HEAD must match the release tag ${tag}.`);
    }
    const taggedManifest = git(cwd, ["show", `${commit}:Info.json`]);
    if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(taggedManifest))) {
        throw new Error("Working Info.json differs from the release tag.");
    }
    return manifest;
}

if (import.meta.main) {
    try {
        const [tag, previousTag] = process.argv.slice(2);
        const manifest = verifyRelease({ tag, previousTag, repository: process.env.GITHUB_REPOSITORY });
        console.log(`Verified ${tag}, ghVersion ${manifest.ghVersion}, against published ${previousTag} and main.`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
