import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { validateReleaseMetadata, verifyRelease } from "./verify-release.js";

const previous = {
    identifier: "xyz.brbc.jellyfin",
    ghRepo: "ada-bee/jellyfin-iina",
    version: "2.0.1",
    ghVersion: 8
};
const candidate = { ...previous, version: "3.0.0", ghVersion: 9 };

describe("release metadata", () => {
    test("accepts a new stable version and increasing IINA update number", () => {
        expect(() => validateReleaseMetadata(candidate, "v3.0.0", previous, "v2.0.1")).not.toThrow();
    });

    test.each([
        ["tag mismatch", { ...candidate, version: "3.0.1" }, "must match"],
        ["unchanged update number", { ...candidate, ghVersion: 8 }, "must exceed"],
        ["decreasing update number", { ...candidate, ghVersion: 7 }, "must exceed"],
        ["fractional update number", { ...candidate, ghVersion: 9.5 }, "positive integer"],
        ["changed plugin identity", { ...candidate, identifier: "different.plugin" }, "preserve"],
        ["changed update repository", { ...candidate, ghRepo: "different/repo" }, "preserve"]
    ])("rejects %s", (_label, manifest, message) => {
        expect(() => validateReleaseMetadata(manifest, "v3.0.0", previous, "v2.0.1")).toThrow(message);
    });

    test("rejects a version rollback even with a larger IINA update number", () => {
        expect(() => validateReleaseMetadata(
            { ...candidate, version: "1.9.0" }, "v1.9.0", previous, "v2.0.1"
        )).toThrow("must be newer");
    });

    test("rejects branch names and prerelease tags in the stable release workflow", () => {
        for (const tag of ["main", "v3.0.0-rc.1", "v03.0.0", undefined]) {
            expect(() => validateReleaseMetadata(candidate, tag, previous, "v2.0.1"))
                .toThrow("stable release tag");
        }
    });
});

const repositories = [];
afterEach(() => {
    for (const directory of repositories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

function git(cwd, args) {
    const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], {
        cwd,
        encoding: "utf8"
    });
    if (result.status !== 0) {
        throw new Error(result.stderr);
    }
}

function createRepository(mainGhVersion = 8) {
    const cwd = mkdtempSync(join(tmpdir(), "jellyfin-iina-release-test-"));
    repositories.push(cwd);
    git(cwd, ["init", "-b", "main"]);
    const pluginDirectory = join(cwd, "xyz.brbc.jellyfin.iinaplugin");
    mkdirSync(pluginDirectory);
    writeFileSync(join(pluginDirectory, "Info.json"), JSON.stringify(previous));
    writeFileSync(join(cwd, "Info.json"), JSON.stringify({
        identifier: previous.identifier,
        version: previous.version,
        ghVersion: mainGhVersion
    }));
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-m", "Previous release"]);
    // The old release tag has a nested manifest; main's root file is only update metadata.
    git(cwd, ["rm", "Info.json"]);
    git(cwd, ["commit", "-m", "Legacy release layout"]);
    git(cwd, ["tag", "v2.0.1"]);
    git(cwd, ["checkout", "-b", "release"]);
    git(cwd, ["branch", "-f", "main", "HEAD~1"]);
    writeFileSync(join(cwd, "Info.json"), JSON.stringify(candidate));
    git(cwd, ["add", "Info.json"]);
    git(cwd, ["commit", "-m", "Release candidate"]);
    git(cwd, ["tag", "v3.0.0"]);
    return { cwd, tag: "v3.0.0", previousTag: "v2.0.1", mainRef: "main", repository: candidate.ghRepo };
}

describe("release source verification", () => {
    test("reads the legacy packaged manifest while main still advertises the published release", () => {
        expect(verifyRelease(createRepository())).toEqual(candidate);
    });

    test("rejects a candidate below the update number already advertised on main", () => {
        expect(() => verifyRelease(createRepository(10))).toThrow("must exceed main");
    });

    test("requires the checked source to be the tagged commit", () => {
        const options = createRepository();
        git(options.cwd, ["commit", "--allow-empty", "-m", "Unreleased change"]);
        expect(() => verifyRelease(options)).toThrow("HEAD must match");
    });

    test("rejects publication from a different GitHub repository", () => {
        expect(() => verifyRelease({ ...createRepository(), repository: "different/repo" }))
            .toThrow("does not match the release repository");
    });
});
