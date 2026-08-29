import type { HttpTransport } from "../../jellyfin/client";

export function createFetchTransport(fetchImplementation: typeof fetch = fetch): HttpTransport {
    return {
        async send(request) {
            const init: RequestInit = {
                method: request.method,
                headers: request.headers
            };
            if (request.body !== undefined) {
                init.body = JSON.stringify(request.body);
            }

            const response = await fetchImplementation(request.url, init);
            return {
                status: response.status,
                statusText: response.statusText,
                text: await response.text()
            };
        }
    };
}
