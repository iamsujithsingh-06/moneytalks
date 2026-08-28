import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(dir, "boot-shutdown-harness.ts");
const tsxCli = path.join(dir, "..", "node_modules", "tsx", "dist", "cli.mjs");

const child = spawn("node", [tsxCli, harnessPath], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

const { code } = await new Promise<{ code: number | null }>((resolve) => {
  child.on("exit", (exitCode) => resolve({ code: exitCode }));
});

console.log("CHILD_EXITED", JSON.stringify({ code }));
console.log("HARNESS_STDOUT:\n" + stdout);
if (stderr) console.log("HARNESS_STDERR:\n" + stderr);

const bootOk = stdout.includes("BOOT_VERIFICATION_OK");
const markers = [
  "Graceful shutdown started",
  "HTTP server closed",
  "Database connection closed",
  "Shutdown complete",
];
const present = Object.fromEntries(markers.map((m) => [m, stdout.includes(m)]));
console.log("MARKERS", JSON.stringify(present));

const ok = code === 0 && bootOk && Object.values(present).every(Boolean);
if (!ok) {
  console.log("VERIFICATION_FAILED");
  process.exit(1);
}
console.log("VERIFICATION_OK");
