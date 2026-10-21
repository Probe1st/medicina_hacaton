import { readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const repoRoot = resolve(__dirname, "../..");
const e2eDir = resolve(repoRoot, "web/e2e");

const specFiles = readdirSync(e2eDir)
  .filter((file) => file.endsWith(".spec.ts"))
  .sort();

console.log(`Discovered ${specFiles.length} E2E specs:`, specFiles);

let currentChild: ChildProcess | null = null;
let currentTempDir: string | null = null;

function cleanup() {
  if (currentChild && !currentChild.killed) {
    try {
      currentChild.kill("SIGTERM");
    } catch {
      // Ignore
    }
  }
  if (currentTempDir) {
    try {
      rmSync(currentTempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

async function runSpec(specFile: string): Promise<number> {
  const tempDir = mkdtempSync(join(tmpdir(), "marshrut-e2e-"));
  currentTempDir = tempDir;
  const dbPath = join(tempDir, "e2e.sqlite");

  console.log(`\n========================================`);
  console.log(`Running E2E: ${specFile}`);
  console.log(`Database: ${dbPath}`);
  console.log(`========================================\n`);

  const env = {
    ...process.env,
    DATABASE_PATH: dbPath,
    E2E_TEMP_DIR: tempDir,
    PUBLIC_ORIGIN: "http://127.0.0.1:4173",
    PORT: "4173",
    NODE_ENV: "test",
  };

  return new Promise<number>((res) => {
    const child = spawn(
      "npm",
      ["--prefix", "web", "run", "test:e2e", "--", `e2e/${specFile}`],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env,
      }
    );

    currentChild = child;

    child.on("close", (code) => {
      currentChild = null;
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      currentTempDir = null;
      res(code ?? 1);
    });

    child.on("error", (err) => {
      console.error(`Failed to spawn runner for ${specFile}:`, err);
      currentChild = null;
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      currentTempDir = null;
      res(1);
    });
  });
}

async function runAll(): Promise<void> {
  for (const specFile of specFiles) {
    const code = await runSpec(specFile);
    if (code !== 0) {
      console.error(`\nSpec failed: ${specFile} (exit code ${code})`);
      process.exit(code);
    }
  }
  console.log("\nAll E2E specs passed successfully!");
}

runAll().catch((err) => {
  console.error("Runner error:", err);
  cleanup();
  process.exit(1);
});
