import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOT = resolve(ROOT, "src");
const files = (await walk(SOURCE_ROOT))
    .filter(path => path.endsWith(".ts") && !path.endsWith(".test.ts"));
const sourceFiles = new Set(files);
const graph = new Map();
const failures = [];

for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = resolveImports(file, source);
    graph.set(file, imports);
    verifyAllowedImports(file, imports);
    verifyNeutralRuntime(file, source);
}

verifyAcyclic(graph);

if (failures.length > 0) {
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(`Source boundaries verified (${files.length} files, no cycles).`);

async function walk(directory) {
    const entries = await readdir(directory);
    const nested = await Promise.all(entries.map(async (entry) => {
        const path = resolve(directory, entry);
        return (await stat(path)).isDirectory() ? walk(path) : [path];
    }));
    return nested.flat();
}

function resolveImports(file, source) {
    const imports = [];
    const pattern = /(?:\bfrom\s+|^\s*import\s+)["']([^"']+)["']/gm;
    for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) {
            continue;
        }
        if (specifier.endsWith(".json")) {
            continue;
        }
        const base = resolve(dirname(file), specifier);
        const candidates = [`${base}.ts`, `${base}.d.ts`, resolve(base, "index.ts")];
        const target = candidates.find(candidate => sourceFiles.has(candidate));
        if (!target) {
            failures.push(`${display(file)} has unresolved local import ${specifier}`);
            continue;
        }
        imports.push(target);
    }
    return imports;
}

function verifyAllowedImports(file, imports) {
    const allowed = allowedLayers(file);
    for (const target of imports) {
        const targetLayer = layerOf(target);
        if (!allowed.has(targetLayer)) {
            failures.push(
                `${display(file)} (${layerOf(file)}) may not import ${display(target)} (${targetLayer})`
            );
        }
    }
}

function allowedLayers(file) {
    const layer = layerOf(file);
    if (layer === "entries") {
        return new Set(["adapters", "jellyfin", "overlay", "playback", "preview", "shared", "sidebar"]);
    }
    if (layer === "shared") {
        return new Set(["shared"]);
    }
    if (layer === "jellyfin") {
        return new Set(["jellyfin", "shared"]);
    }
    if (layer === "playback") {
        return new Set(["jellyfin", "playback", "shared"]);
    }
    if (layer === "overlay") {
        return new Set(["jellyfin", "overlay", "shared"]);
    }
    if (layer === "preview") {
        return new Set(["adapters", "jellyfin", "preview", "shared", "sidebar"]);
    }
    if (layer === "adapters") {
        return new Set(["adapters", "jellyfin", "overlay", "playback", "shared", "sidebar"]);
    }
    if (isSidebarDomain(file)) {
        return new Set(["jellyfin", "playback", "shared", "sidebar"]);
    }
    return new Set(["adapters", "jellyfin", "playback", "shared", "sidebar"]);
}

function verifyNeutralRuntime(file, source) {
    if (!isNeutralModule(file)) {
        return;
    }
    const match = source.match(/\b(?:iina|document|window|localStorage)\s*\.|\bDate\.now\s*\(/);
    if (match) {
        failures.push(`${display(file)} directly uses environment runtime ${match[0]}`);
    }
}

function isNeutralModule(file) {
    const layer = layerOf(file);
    return layer === "shared"
        || layer === "jellyfin"
        || layer === "playback"
        || (layer === "overlay" && /\/(?:controller|eligibility)\.ts$/.test(file))
        || isSidebarDomain(file);
}

function isSidebarDomain(file) {
    const path = display(file);
    return path.startsWith("src/sidebar/requests/")
        || /^src\/sidebar\/(?:backdropSlideshow|launch|router|store|viewFormatting|viewModels)\.ts$/.test(path);
}

function verifyAcyclic(sourceGraph) {
    const active = new Set();
    const visited = new Set();
    const stack = [];

    function visit(file) {
        if (active.has(file)) {
            const start = stack.indexOf(file);
            failures.push(`source cycle: ${[...stack.slice(start), file].map(display).join(" -> ")}`);
            return;
        }
        if (visited.has(file)) {
            return;
        }
        active.add(file);
        stack.push(file);
        for (const target of sourceGraph.get(file) || []) {
            visit(target);
        }
        stack.pop();
        active.delete(file);
        visited.add(file);
    }

    files.forEach(visit);
}

function layerOf(file) {
    return display(file).split("/")[1] || "unknown";
}

function display(file) {
    return relative(ROOT, file).split(sep).join("/");
}
