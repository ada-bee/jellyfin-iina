import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";

const projectRoot = resolve(import.meta.dir, "..");
const sourceRoot = resolve(projectRoot, "src");
const pluginUiRoot = resolve(projectRoot, "ui");
const sidebarHtmlPath = resolve(pluginUiRoot, "sidebar.html");
const previewEntryPath = resolve(sourceRoot, "entries/preview.ts");
const iinaWebsiteDataRoot = resolve(
    homedir(),
    "Library/WebKit/com.colliderli.iina/WebsiteData/Default"
);
const port = Number.parseInt(process.env.SIDEBAR_PREVIEW_PORT || "4173", 10);
let previewRevision = 1;
let iinaStoragePath;

const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8"
};

function noStoreHeaders(contentType) {
    return {
        "Cache-Control": "no-store",
        "Content-Type": contentType
    };
}

function decodeLocalStorageValue(value) {
    if (value instanceof Uint8Array) {
        return new TextDecoder("utf-16le").decode(value);
    }
    return String(value ?? "");
}

function readSessionFromDatabase(databasePath) {
    const database = new Database(databasePath, { readonly: true });
    try {
        const row = database.query("select value from ItemTable where key = ?").get("jellyfin-session");
        if (!row?.value) {
            return null;
        }
        const session = JSON.parse(decodeLocalStorageValue(row.value));
        if (!session.serverUrl || !session.accessToken || !session.userId) {
            return null;
        }
        return session;
    } finally {
        database.close();
    }
}

async function loadIinaSession() {
    if (iinaStoragePath) {
        const session = readSessionFromDatabase(iinaStoragePath);
        if (session) {
            return session;
        }
        iinaStoragePath = undefined;
    }

    const databases = new Bun.Glob("**/LocalStorage/localstorage.sqlite3");
    for await (const databasePath of databases.scan({ cwd: iinaWebsiteDataRoot, absolute: true })) {
        try {
            const session = readSessionFromDatabase(databasePath);
            if (session) {
                iinaStoragePath = databasePath;
                return session;
            }
        } catch {
            // Ignore unrelated or temporarily locked WebKit databases.
        }
    }
    throw new Error("No Jellyfin session was found in IINA");
}

function buildJellyfinAuthorization(accessToken) {
    return `MediaBrowser Client="IINA Sidebar Preview", Device="Browser Preview", DeviceId="iina-sidebar-preview", Version="1", Token="${accessToken}"`;
}

async function proxyJellyfinRequest(request, url) {
    const session = await loadIinaSession();
    const proxyPrefix = "/__preview/jellyfin";
    const upstreamBase = new URL(session.serverUrl);
    upstreamBase.search = "";
    upstreamBase.hash = "";
    upstreamBase.pathname = `${upstreamBase.pathname.replace(/\/+$/, "")}/`;
    const upstreamPath = url.pathname.slice(proxyPrefix.length).replace(/^\/+/, "");
    const upstreamUrl = new URL(upstreamPath, upstreamBase);
    upstreamUrl.search = url.search;

    const headers = new Headers();
    for (const name of ["accept", "content-type", "range"]) {
        const value = request.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }
    headers.set("Authorization", buildJellyfinAuthorization(session.accessToken));

    const response = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual"
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
}

async function buildPreviewScript() {
    const build = await Bun.build({
        entrypoints: [previewEntryPath],
        format: "iife",
        sourcemap: "inline",
        target: "browser"
    });

    if (!build.success) {
        const message = build.logs.map(log => String(log)).join("\n");
        console.error(message);
        return new Response(message, {
            status: 500,
            headers: noStoreHeaders("text/plain; charset=utf-8")
        });
    }

    return new Response(await build.outputs[0].arrayBuffer(), {
        headers: noStoreHeaders("text/javascript; charset=utf-8")
    });
}

async function buildPreviewHtml() {
    const productionHtml = await readFile(sidebarHtmlPath, "utf8");
    const productionScript = '<script src="dist/sidebar.js"></script>';
    const previewScripts = [
        '<script src="/__preview/sidebar.js"></script>',
        "<script>",
        "let previewRevision;",
        "async function pollPreviewRevision() {",
        "    try {",
        "        const response = await fetch('/__preview/version');",
        "        const nextRevision = await response.text();",
        "        if (previewRevision && previewRevision !== nextRevision) window.location.reload();",
        "        previewRevision = nextRevision;",
        "    } catch {",
        "        // The preview server may briefly disappear while it restarts.",
        "    } finally {",
        "        window.setTimeout(pollPreviewRevision, 500);",
        "    }",
        "}",
        "pollPreviewRevision();",
        "</script>"
    ].join("\n");

    if (!productionHtml.includes(productionScript)) {
        throw new Error("Could not find the production sidebar script tag");
    }

    return productionHtml.replace(productionScript, previewScripts);
}

function hashString(value) {
    let hash = 0;
    for (const character of value) {
        hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    return Math.abs(hash);
}

function createFixtureImage(itemId, imageType) {
    const palettes = [
        ["#10283d", "#497997", "#c98361"],
        ["#1d1837", "#665a92", "#c58c73"],
        ["#12332d", "#397a67", "#9bb69a"],
        ["#321b19", "#8a533c", "#d1a270"],
        ["#171f3a", "#526aa3", "#b1a4c6"],
        ["#292413", "#786935", "#d1bd75"]
    ];
    const seed = hashString(`${itemId}-${imageType}`);
    const [shadow, midtone, highlight] = palettes[seed % palettes.length];
    const scene = seed % 5;
    const scenes = [
        '<path d="M0 244h640v116H0z" fill="#061019" opacity=".72"/><path d="M42 265h54v95H42zm70-40h72v135h-72zm92 70h49v65h-49zm77-105h86v170h-86zm108 58h57v112h-57zm81-31h104v143H470z" fill="#09131d" opacity=".72"/><path d="M302 205h44v14h-44z" fill="#f2ba7c" opacity=".65"/>' ,
        '<circle cx="472" cy="98" r="118" fill="url(#orb)"/><path d="M296 142c85-62 210-75 332-30" fill="none" stroke="#f0d3bb" stroke-width="4" opacity=".32"/><circle cx="180" cy="242" r="4" fill="#fff" opacity=".8"/><circle cx="128" cy="109" r="2" fill="#fff" opacity=".6"/>',
        '<path d="M0 325 177 158l70 72 91-117 205 212z" fill="#0b1720" opacity=".72"/><path d="m338 113 47 54-25-9-21 21-21-20-27 12z" fill="#fff" opacity=".2"/><path d="M0 309c157-46 288-41 640 7v44H0z" fill="#071117" opacity=".62"/>',
        '<path d="M0 360 267 145h88l285 215z" fill="#0b1019" opacity=".75"/><path d="m267 145 42 215h8l-13-215zm88 0-35 215h8l69-215z" fill="#c4a778" opacity=".5"/><path d="M122 298h396" stroke="#f3d29b" stroke-width="3" opacity=".25"/>',
        '<path d="M0 201c117-35 207 38 319 11 120-29 203-80 321-45v193H0z" fill="#071b25" opacity=".64"/><path d="M0 225c128-31 225 29 343 2 106-24 189-61 297-32" fill="none" stroke="#d1eced" stroke-width="3" opacity=".25"/><circle cx="522" cy="86" r="62" fill="#f4d5ae" opacity=".34"/>'
    ];

    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop stop-color="${shadow}"/>
                    <stop offset=".58" stop-color="${midtone}"/>
                    <stop offset="1" stop-color="${highlight}"/>
                </linearGradient>
                <radialGradient id="orb" cx="35%" cy="30%" r="70%">
                    <stop stop-color="${highlight}"/>
                    <stop offset="1" stop-color="${shadow}"/>
                </radialGradient>
            </defs>
            <rect width="640" height="360" fill="url(#bg)"/>
            ${scenes[scene]}
            <rect width="640" height="360" fill="#000" opacity=".06"/>
        </svg>
    `;
}

async function serveStaticFile(pathname) {
    const requestedPath = resolve(pluginUiRoot, `.${pathname}`);
    const assetsRoot = resolve(pluginUiRoot, "assets");
    const isSidebarCss = requestedPath === resolve(pluginUiRoot, "sidebar.css");
    const isAsset = requestedPath.startsWith(`${assetsRoot}${sep}`);

    if (!isSidebarCss && !isAsset) {
        return null;
    }

    try {
        const contentType = mimeTypes[extname(requestedPath)] || "application/octet-stream";
        return new Response(await readFile(requestedPath), {
            headers: noStoreHeaders(contentType)
        });
    } catch {
        return null;
    }
}

async function servePreviewPage() {
    try {
        return new Response(await buildPreviewHtml(), {
            headers: noStoreHeaders("text/html; charset=utf-8")
        });
    } catch (error) {
        return errorResponse(error, "Preview failed", 500);
    }
}

async function servePreviewSession(url) {
    try {
        const session = await loadIinaSession();
        return Response.json({
            serverUrl: `${url.origin}/__preview/jellyfin`,
            accessToken: "preview-proxy",
            userId: session.userId,
            username: session.username || "",
            serverName: session.serverName || ""
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return errorResponse(error, "IINA session unavailable", 404);
    }
}

async function serveJellyfinProxy(request, url) {
    try {
        return await proxyJellyfinRequest(request, url);
    } catch (error) {
        return errorResponse(error, "Jellyfin proxy failed", 502);
    }
}

function serveFixtureImage(pathname) {
    const match = pathname.match(/^\/Items\/([^/]+)\/Images\/([^/]+)$/);
    if (!match) {
        return null;
    }
    const itemId = decodeURIComponent(match[1]);
    const imageType = decodeURIComponent(match[2]);
    return new Response(createFixtureImage(itemId, imageType), {
        headers: noStoreHeaders("image/svg+xml; charset=utf-8")
    });
}

function errorResponse(error, fallbackMessage, status) {
    return new Response(error instanceof Error ? error.message : fallbackMessage, {
        status,
        headers: noStoreHeaders("text/plain; charset=utf-8")
    });
}

async function handlePreviewRequest(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/preview") {
        return await servePreviewPage();
    }
    if (url.pathname === "/__preview/sidebar.js") {
        return await buildPreviewScript();
    }
    if (url.pathname === "/__preview/version") {
        return new Response(String(previewRevision), {
            headers: noStoreHeaders("text/plain; charset=utf-8")
        });
    }
    if (url.pathname === "/__preview/session") {
        return await servePreviewSession(url);
    }
    if (url.pathname.startsWith("/__preview/jellyfin/")) {
        return await serveJellyfinProxy(request, url);
    }
    const fixtureImage = serveFixtureImage(url.pathname);
    if (fixtureImage) {
        return fixtureImage;
    }
    const staticResponse = await serveStaticFile(url.pathname);
    return staticResponse || new Response("Not found", { status: 404 });
}

const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: handlePreviewRequest
});

let reloadTimer;
const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
        previewRevision += 1;
    }, 80);
};
const watchers = [
    watch(sourceRoot, { recursive: true }, scheduleReload),
    watch(pluginUiRoot, { recursive: true }, scheduleReload)
];

function stopServer() {
    watchers.forEach(watcher => watcher.close());
    server.stop();
}

process.on("SIGINT", stopServer);
process.on("SIGTERM", stopServer);

console.log(`Sidebar preview: http://localhost:${server.port}/?state=home`);
console.log(`Live data: http://localhost:${server.port}/?source=live`);
console.log("States: home, search, movie, series, login, loading, empty, error");
