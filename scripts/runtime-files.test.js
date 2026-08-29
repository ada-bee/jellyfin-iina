import { describe, expect, test } from "bun:test";

import { validateManifest } from "./runtime-files";

function validManifest() {
    return {
        name: "Jellyfin",
        identifier: "xyz.brbc.jellyfin",
        version: "3.0.0",
        ghRepo: "ada-bee/jellyfin-iina",
        ghVersion: 3,
        description: "Jellyfin integration",
        entry: "dist/main.js",
        globalEntry: "dist/global.js",
        preferencesPage: "ui/preferences.html",
        author: { name: "Adéla" },
        sidebarTab: { name: "Jellyfin" },
        permissions: ["network-request"],
        allowedDomains: ["*"]
    };
}

describe("runtime manifest validation", () => {
    test("accepts the required release metadata", () => {
        const errors = [];

        validateManifest(validManifest(), errors);

        expect(errors).toEqual([]);
    });

    test("reports every malformed required field in one pass", () => {
        const errors = [];
        const manifest = validManifest();
        manifest.name = " ";
        manifest.ghVersion = "3";
        manifest.author = {};
        manifest.sidebarTab = {};
        manifest.permissions = [];
        manifest.allowedDomains = null;

        validateManifest(manifest, errors);

        expect(errors).toEqual([
            "Info.json is missing a non-empty name.",
            "Info.json is missing an integer ghVersion.",
            "Info.json is missing author.name.",
            "Info.json is missing sidebarTab.name.",
            "Info.json is missing permissions.",
            "Info.json is missing allowedDomains."
        ]);
    });
});
