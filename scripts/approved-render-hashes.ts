// Prints the approved-render fingerprint fixture (see tests/helpers/approvedRenders.ts).
import { execSync } from "node:child_process";
import { approvedRenderHashes } from "../tests/helpers/approvedRenders";

const baseline = (() => { try { return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } })();
process.stdout.write(JSON.stringify({ baseline, hashes: approvedRenderHashes() }, null, 2) + "\n");
