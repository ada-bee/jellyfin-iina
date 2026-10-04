/** Remove credentials before a server or transport error reaches the UI or logs. */
export function redactCredentials(text: string, secrets: readonly string[] = []): string {
    let result = text;
    for (const secret of secrets) {
        if (secret) {
            result = result.split(secret).join("[redacted]");
            result = result.split(encodeURIComponent(secret)).join("[redacted]");
        }
    }
    return result
        .replace(/([?&](?:api_?key|access_token|x-emby-token)=)[^&#\s"'<>]*/gi, "$1[redacted]")
        .replace(/((?:Token|AccessToken|Pw|Password|X-Emby-Token|X-MediaBrowser-Token)"?\s*[:=]\s*")[^"]*"/gi, '$1[redacted]"')
        .replace(/(\bBearer\s+)[^\s,"'<>]+/gi, "$1[redacted]");
}
