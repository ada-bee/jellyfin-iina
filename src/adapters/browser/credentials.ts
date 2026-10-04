import type { CredentialRequest, CredentialResponse, StoredSession } from "../../jellyfin/credentials";
import { MESSAGE_NAMES } from "../../jellyfin/messages";

interface CredentialBridge {
    postMessage(name: typeof MESSAGE_NAMES.CredentialRequest, payload: CredentialRequest): void;
    onMessage(
        name: typeof MESSAGE_NAMES.CredentialResponse,
        handler: (payload: CredentialResponse) => void
    ): void;
}

export interface SessionCredentials {
    load(): Promise<StoredSession | null>;
    save(session: StoredSession): Promise<void>;
    clear(session: StoredSession): Promise<void>;
}

export function createSessionCredentials(bridge: CredentialBridge, timeoutMs = 60_000): SessionCredentials {
    let nextRequestId = 0;
    const requestPrefix = `${Date.now()}-${Math.random()}-`;
    const pending = new Map<string, (response: CredentialResponse) => void>();
    bridge.onMessage(MESSAGE_NAMES.CredentialResponse, response => {
        pending.get(response.requestId)?.(response);
    });

    function request(payload: CredentialRequest): Promise<StoredSession | null> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pending.delete(payload.requestId);
                reject(new Error("IINA did not respond to the Keychain request. Try signing in again."));
            }, timeoutMs);
            pending.set(payload.requestId, response => {
                clearTimeout(timeout);
                pending.delete(payload.requestId);
                if (response.ok) {
                    resolve(response.session);
                } else {
                    reject(new Error(response.error));
                }
            });
            try {
                bridge.postMessage(MESSAGE_NAMES.CredentialRequest, payload);
            } catch {
                clearTimeout(timeout);
                pending.delete(payload.requestId);
                reject(new Error("Could not access IINA's Keychain. Try signing in again."));
            }
        });
    }

    const requestId = () => `${requestPrefix}${++nextRequestId}`;
    return {
        load: () => request({ requestId: requestId(), operation: "load" }),
        async save(session) {
            await request({ requestId: requestId(), operation: "save", session });
        },
        async clear(session) {
            await request({ requestId: requestId(), operation: "clear", session });
        }
    };
}
