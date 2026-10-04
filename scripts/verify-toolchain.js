import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const expected = manifest.engines.bun;

if (Bun.version !== expected || manifest.packageManager !== `bun@${expected}`) {
    console.error(`Use Bun ${expected}; the current runtime is ${Bun.version}.`);
    process.exit(1);
}

console.log(`Verified Bun ${expected}.`);
