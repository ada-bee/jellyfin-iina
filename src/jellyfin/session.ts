import type { AuthUpdatedPayload } from "./messages";
import { normalizeServerUrl } from "./url";

export interface AuthState extends AuthUpdatedPayload {}

let authState: AuthState | null = null;

export function updateAuthState(payload: AuthUpdatedPayload): AuthState {
    authState = {
        ...payload,
        serverUrl: normalizeServerUrl(payload.serverUrl)
    };
    return authState;
}

export function clearAuthState(): void {
    authState = null;
}

export function getAuthState(): AuthState | null {
    return authState;
}
