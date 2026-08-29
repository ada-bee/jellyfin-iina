import { verifyRuntimeTree } from "./runtime-files.js";

try {
    const manifest = verifyRuntimeTree(process.cwd(), "repository root");
    console.log(`Verified root runtime (${manifest.identifier} ${manifest.version}).`);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
