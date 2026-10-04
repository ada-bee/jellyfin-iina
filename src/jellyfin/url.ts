export function isHttpsUrl(url: string): boolean {
    return parseHttpsUrl(url) !== null;
}

export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

interface HttpsUrl {
    origin: string;
    path: string;
    query: string;
    hasSuffix: boolean;
}

/** Resolve Jellyfin delivery paths without putting credentials into media URLs. */
export function resolveDeliveryUrl(serverUrl: string, deliveryUrl: string): string {
    const server = parseServerUrl(serverUrl);
    if (!server || hasUnsafeCharacters(deliveryUrl)) {
        return "";
    }
    const delivery = deliveryUrl.trim();
    if (!delivery || delivery.startsWith("//")) {
        return "";
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(delivery)) {
        return serializeDeliveryUrl(parseHttpsUrl(delivery));
    }

    const path = `/${delivery.replace(/^\//, "")}`;
    const prefix = isWithinBasePath(path.split(/[?#]/, 1)[0], server.path)
        ? ""
        : server.path;
    return serializeDeliveryUrl(parseHttpsUrl(`${server.origin}${prefix}${path}`));
}

/** Only URLs inside the configured server's Base URL may receive its auth headers. */
export function isSameServerUrl(serverUrl: string, url: string): boolean {
    const server = parseServerUrl(serverUrl);
    const candidate = parseHttpsUrl(url);
    return server !== null
        && candidate !== null
        && server.origin === candidate.origin
        && isWithinBasePath(candidate.path, server.path);
}

function parseServerUrl(url: string): HttpsUrl | null {
    const parsed = parseHttpsUrl(normalizeServerUrl(url));
    if (!parsed || parsed.hasSuffix || hasUnsafeCharacters(url)) {
        return null;
    }
    return { ...parsed, path: parsed.path.replace(/\/+$/, "") };
}

function parseHttpsUrl(url: string): HttpsUrl | null {
    if (hasUnsafeCharacters(url)) {
        return null;
    }
    const match = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(url.trim());
    if (!match) {
        return null;
    }
    const authority = normalizeAuthority(match[1]);
    const path = match[2] || "/";
    if (!authority || !hasSafePath(path)) {
        return null;
    }
    return {
        origin: `https://${authority}`,
        path,
        query: (match[3] || "").slice(1),
        hasSuffix: Boolean(match[3] || match[4])
    };
}

function normalizeAuthority(authority: string): string {
    const match = /^(\[[\da-f:.]+\]|[a-z\d._-]+)(?::(\d+))?$/i.exec(authority);
    if (!match) {
        return "";
    }
    const port = match[2] === undefined ? 443 : Number(match[2]);
    if (!Number.isInteger(port) || port > 65535) {
        return "";
    }
    return match[1].toLowerCase() + (port === 443 ? "" : `:${port}`);
}

function hasUnsafeCharacters(value: string): boolean {
    return /[\u0000-\u001f\u007f\\]/.test(value);
}

function hasSafePath(path: string): boolean {
    // Reject ambiguous separators and traversal instead of relying on each HTTP
    // client and reverse proxy to normalize them in the same way.
    if (!path.startsWith("/") || /[\u0000-\u0020\u007f\\]/.test(path) || /%(?:2f|5c|3f|23)/i.test(path)) {
        return false;
    }
    try {
        const decoded = decodeURIComponent(path);
        return !hasUnsafeCharacters(decoded)
            && !/(?:^|\/)\.{1,2}(?:[\/;]|$)/.test(decoded)
            && !/%[\da-f]{2}/i.test(decoded);
    } catch (_) {
        return false;
    }
}

function isWithinBasePath(path: string, basePath: string): boolean {
    return !basePath || path === basePath || path.startsWith(`${basePath}/`);
}

function serializeDeliveryUrl(url: HttpsUrl | null): string {
    if (!url) {
        return "";
    }
    const query = url.query.split("&").filter(keepQueryParameter).join("&");
    return `${url.origin}${url.path}${query ? `?${query}` : ""}`;
}

function keepQueryParameter(parameter: string): boolean {
    try {
        const name = decodeURIComponent(parameter.split("=", 1)[0]).toLowerCase();
        return !["api_key", "apikey", "access_token", "x-emby-token"].includes(name);
    } catch (_) {
        return false;
    }
}
