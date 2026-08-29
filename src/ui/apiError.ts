export class JellyfinApiError extends Error {
    constructor(
        readonly status: number,
        readonly endpoint: string
    ) {
        super(`Jellyfin request failed (${status}) for ${endpoint}.`);
        this.name = "JellyfinApiError";
    }
}

export function isConfirmedAuthenticationFailure(error: unknown): boolean {
    return error instanceof JellyfinApiError && error.status === 401;
}
