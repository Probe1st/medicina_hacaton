import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { buildServer } from "./app";
import { seedAccounts } from "./accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFileInServer = resolve(__dirname, "../.env");
if (existsSync(envFileInServer)) {
  process.loadEnvFile(envFileInServer);
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await buildServer({
    databasePath: config.databasePath,
    publicOrigin: config.publicOrigin,
    nodeEnv: config.nodeEnv,
    staticRoot: config.staticRoot,
  });

  const stop = async () => {
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      console.error("Error during server shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  try {
    const shouldAutoSeed =
      process.env.AUTO_SEED_DEMO === "true" ||
      (process.env.AUTO_SEED_DEMO !== "false" && config.nodeEnv === "development");

    if (shouldAutoSeed) {
      const results = await seedAccounts(config.databasePath);
      console.log(
        "Demo accounts seeded:",
        results.map((r) => `${r.user} (${r.role})`).join(", ")
      );
    }

    await app.listen({ host: "127.0.0.1", port: config.port });
    console.log(`Server listening at http://127.0.0.1:${config.port}`);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
