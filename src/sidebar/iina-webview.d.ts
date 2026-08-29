import type {
    PluginToUiMessageName,
    PluginToUiMessagePayloads,
    UiToPluginMessageName,
    UiToPluginMessagePayloads
} from "../jellyfin/messages";

declare global {
    namespace IINA {
        interface IINAGlobal {
            postMessage: <Name extends UiToPluginMessageName>(
                name: Name,
                payload: UiToPluginMessagePayloads[Name]
            ) => void;
            onMessage: <Name extends PluginToUiMessageName>(
                name: Name,
                handler: (payload: PluginToUiMessagePayloads[Name]) => void
            ) => void;
        }
    }

    const iina: IINA.IINAGlobal;
}

export {};
