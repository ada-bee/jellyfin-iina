import type { JellyfinDeviceProfile } from "./types";

export const IINA_DEVICE_PROFILE = {
    MaxStreamingBitrate: 2147483647,
    MaxStaticBitrate: 2147483647,
    MusicStreamingTranscodingBitrate: 2147483647,
    DirectPlayProfiles: [
        { Container: "", Type: "Video" },
        { Container: "", Type: "Audio" }
    ],
    TranscodingProfiles: [],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
        { Format: "srt", Method: "External" },
        { Format: "ass", Method: "External" },
        { Format: "ssa", Method: "External" },
        { Format: "vtt", Method: "External" },
        { Format: "srt", Method: "Embed" },
        { Format: "subrip", Method: "Embed" },
        { Format: "ass", Method: "Embed" },
        { Format: "ssa", Method: "Embed" },
        { Format: "webvtt", Method: "Embed" },
        { Format: "mov_text", Method: "Embed" },
        { Format: "pgssub", Method: "Embed" },
        { Format: "dvdsub", Method: "Embed" },
        { Format: "dvbsub", Method: "Embed" }
    ]
} satisfies JellyfinDeviceProfile;
