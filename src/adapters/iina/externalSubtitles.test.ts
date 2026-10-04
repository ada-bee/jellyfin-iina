import { afterEach, describe, expect, test } from "bun:test";
import type { PlaybackSession } from "../../playback/ports";
import type { MpvTrackInfo } from "../../playback/tracks";
import { IinaPlayer } from "./player";

const previousIina = globalThis.iina;
afterEach(() => { globalThis.iina = previousIina; });

function createHarness(selectedIndex: number | null = 4) {
    let mediaPath = "https://media.example.test/jellyfin/Videos/item/stream";
    let sid = "no";
    const files = new Set<string>();
    const deleted: string[] = [];
    const commands: { command: string; args: string[] }[] = [];
    const errors: string[] = [];
    const tracks: MpvTrackInfo[] = [{ type: "audio", id: 1, "ff-index": 1, selected: true }];
    const downloads: {
        url: string;
        path: string;
        headers: Record<string, string>;
        resolve: () => void;
        reject: () => void;
    }[] = [];
    globalThis.iina = {
        mpv: {
            getString: (name: string) => name === "path" ? mediaPath : sid,
            getNative: () => tracks,
            set: (name: string, value: unknown) => {
                if (name !== "sid") return;
                sid = String(value);
                for (const track of tracks) {
                    if (track.type === "sub") track.selected = String(track.id) === sid;
                }
            },
            command: (command: string, args: string[]) => {
                commands.push({ command, args });
                if (command !== "sub-add") return;
                const id = tracks.length + 1;
                if (args[1] === "select") sid = String(id);
                for (const track of tracks) {
                    if (track.type === "sub") track.selected = false;
                }
                tracks.push({
                    type: "sub", id, external: true, "ff-index": 0,
                    "external-filename": args[0], selected: args[1] === "select"
                });
            }
        },
        http: {
            download: (url: string, path: string, options: { headers: Record<string, string> }) => (
                new Promise<undefined>((resolve, reject) => downloads.push({
                    url, path, headers: options.headers,
                    resolve: () => { files.add(path); resolve(undefined); },
                    reject: () => reject(new Error("HTTP error containing a secret token"))
                }))
            )
        },
        file: {
            exists: (path: string) => files.has(path),
            delete: (path: string) => { deleted.push(path); files.delete(path); }
        },
        utils: { resolvePath: (path: string) => path.replace("@tmp", "/tmp/plugin") }
    } as unknown as typeof iina;
    const playback: PlaybackSession = {
        itemId: "item", mediaSourceId: "source", playSessionId: "session", userId: "user",
        accessToken: "secret token", deviceId: "device", serverUrl: "https://media.example.test/jellyfin",
        runtimeTicks: 0, playMethod: "DirectPlay", isEpisode: false,
        audioStreamIndex: 1, subtitleStreamIndex: selectedIndex,
        externalSubtitles: [{
            index: 4, url: "https://media.example.test/jellyfin/Videos/item/source/Subtitles/4/Stream.ass",
            title: "English", language: "eng", isDefault: true,
            isForced: true, isHearingImpaired: true
        }]
    };
    const player = new IinaPlayer({ debug: () => undefined, error: message => errors.push(message) });
    return {
        player, playback, downloads, commands, deleted, files, errors,
        setPath: (path: string) => { mediaPath = path; },
        setSid: (value: string) => { sid = value; },
        getSid: () => sid
    };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("authenticated external subtitles", () => {
    test("downloads locally and maps the selected track to its Jellyfin index", async () => {
        const h = createHarness();
        h.player.loadExternalSubtitles(h.playback);
        h.player.applyTrackSelection(h.playback);
        expect(h.player.getTrackSelection(h.playback).subtitleStreamIndex).toBe(4);
        expect(h.downloads[0].headers.Authorization).toContain('Token="secret%20token"');
        expect(h.downloads[0].url).not.toContain("secret");
        expect(h.downloads[0].path).toEndWith("-4.ass");
        h.downloads[0].resolve();
        await settle();
        expect(h.commands[0]).toMatchObject({ command: "sub-add" });
        expect(h.commands[0].args[0]).toStartWith("/tmp/plugin/");
        expect(h.commands[0].args.slice(1)).toEqual(["select", "English", "eng"]);
        expect(h.player.getTrackSelection(h.playback).subtitleStreamIndex).toBe(4);
        h.player.clearExternalSubtitles();
        expect(h.files.size).toBe(0);
    });

    test("keeps subtitles off even when the source marks an external track default and forced", async () => {
        const h = createHarness(null);
        h.player.loadExternalSubtitles(h.playback);
        h.player.applyTrackSelection(h.playback);
        h.downloads[0].resolve();
        await settle();
        expect(h.commands[0].args[1]).toBe("auto");
        expect(h.getSid()).toBe("no");
        expect(h.player.getTrackSelection(h.playback).subtitleStreamIndex).toBeNull();
    });

    test("keeps the selected track when alternate downloads finish afterwards", async () => {
        const h = createHarness();
        h.playback.externalSubtitles.push({
            ...h.playback.externalSubtitles[0], index: 5, isDefault: false,
            url: "https://media.example.test/jellyfin/Videos/item/source/Subtitles/5/Stream.srt"
        });
        h.player.loadExternalSubtitles(h.playback);
        h.downloads[0].resolve();
        await settle();
        const selectedSid = h.getSid();
        h.downloads[1].resolve();
        await settle();
        expect(h.commands.map(command => command.args[1])).toEqual(["select", "auto"]);
        expect(h.getSid()).toBe(selectedSid);
        expect(h.player.getTrackSelection(h.playback).subtitleStreamIndex).toBe(4);
    });

    test("does not override a user selection made while downloading", async () => {
        const h = createHarness();
        h.player.loadExternalSubtitles(h.playback);
        h.setSid("3");
        h.downloads[0].resolve();
        await settle();
        expect(h.commands[0].args[1]).toBe("auto");
        expect(h.getSid()).toBe("3");
    });

    test("discards late subtitles after changing files or replaying the same file", async () => {
        const h = createHarness();
        h.player.loadExternalSubtitles(h.playback);
        h.player.clearExternalSubtitles();
        h.player.loadExternalSubtitles(h.playback);
        h.downloads[0].resolve();
        await settle();
        expect(h.commands).toEqual([]);
        expect(h.deleted).toContain(h.downloads[0].path);
        h.setPath("https://another.example.test/video");
        h.downloads[1].resolve();
        await settle();
        expect(h.commands).toEqual([]);
        expect(h.files.size).toBe(0);
    });

    test("never authenticates a subtitle on another host or outside the server's base path", () => {
        const h = createHarness();
        h.playback.externalSubtitles[0].url = "https://subtitles.example.test/sub.srt";
        h.player.loadExternalSubtitles(h.playback);
        expect(h.downloads[0].headers).toEqual({});
        h.playback.externalSubtitles[0].url = "https://media.example.test/another/sub.srt";
        h.player.loadExternalSubtitles(h.playback);
        expect(h.downloads[1].headers).toEqual({});
    });

    test("reports failed subtitles without exposing request credentials", async () => {
        const h = createHarness();
        h.player.loadExternalSubtitles(h.playback);
        h.downloads[0].reject();
        await settle();
        expect(h.commands).toEqual([]);
        expect(h.errors).toEqual(["Jellyfin: Failed to load subtitle track 4."]);
        expect(h.player.getTrackSelection(h.playback).subtitleStreamIndex).toBeNull();
    });
});
