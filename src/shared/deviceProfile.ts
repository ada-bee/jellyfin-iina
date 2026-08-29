import type { JellyfinDeviceProfile } from "./jellyfin";

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
        { Format: "vtt", Method: "External" }
    ]
} satisfies JellyfinDeviceProfile;
