import {
    CREDENTIAL_ACCOUNT,
    CREDENTIAL_SERVICE,
    matchesSession,
    parseStoredSession,
    type CredentialRequest,
    type CredentialResponse,
    type StoredSession
} from "../../jellyfin/credentials";

export interface KeychainStore {
    keychainRead(service: string, name: string): string | false;
    keychainWrite(service: string, name: string, password: string): boolean;
}

export function handleCredentialRequest(
    request: CredentialRequest,
    keychain: KeychainStore
): CredentialResponse {
    try {
        const session = performCredentialOperation(request, keychain);
        return { requestId: request.requestId, ok: true, session };
    } catch {
        return {
            requestId: request.requestId,
            ok: false,
            error: "Unable to access saved Jellyfin credentials."
        };
    }
}

function performCredentialOperation(
    request: CredentialRequest,
    keychain: KeychainStore
): StoredSession | null {
    switch (request.operation) {
        case "load":
            return loadSession(keychain);
        case "save": {
            const session = parseStoredSession(request.session);
            if (!session) throw new Error("Invalid session");
            writeSession(keychain, JSON.stringify(session));
            return null;
        }
        case "clear":
            clearSession(keychain, request.session);
            return null;
    }
}

function loadSession(keychain: KeychainStore): StoredSession | null {
    const value = keychain.keychainRead(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
    if (value === false || value === "") return null;
    const session = parseStoredSession(JSON.parse(value));
    if (!session) throw new Error("Invalid stored session");
    return session;
}

function clearSession(keychain: KeychainStore, expected: StoredSession): void {
    const value = keychain.keychainRead(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
    if (value === false) throw new Error("Keychain read failed");
    if (value === "") return;
    const current = parseStoredSession(JSON.parse(value));
    const session = parseStoredSession(expected);
    if (!current || !session) throw new Error("Invalid stored session");
    if (!matchesSession(current, session)) return;
    // IINA exposes no Keychain delete operation.
    writeSession(keychain, "");
}

function writeSession(keychain: KeychainStore, value: string): void {
    if (!keychain.keychainWrite(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT, value)) {
        throw new Error("Keychain write failed");
    }
}
