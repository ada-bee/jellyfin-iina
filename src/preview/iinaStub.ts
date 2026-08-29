export function installIinaStub(window: Window): void {
    const previewWindow = window as Window & {
        __iinaPreviewMessages?: Array<{ name: string; data: unknown }>;
    };
    previewWindow.__iinaPreviewMessages = [];
    Object.defineProperty(window, "iina", {
        configurable: true,
        value: {
            postMessage: (name: string, data: unknown) => {
                previewWindow.__iinaPreviewMessages?.push({ name, data });
            },
            onMessage: () => undefined
        }
    });
}
