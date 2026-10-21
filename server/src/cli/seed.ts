import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSeedUsersFromEnv, seedAccounts } from "../accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dirname, "../../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databasePath = process.env.DATABASE_PATH || "./marshrut.sqlite";

async function seed(): Promise<void> {
  console.log(`\nИнициализация базы данных: ${databasePath}`);

  const users = parseSeedUsersFromEnv();
  const results = await seedAccounts(databasePath, users);

  console.log("\n=======================================================");
  console.log("            СИДИРОВАНИЕ УЧЕБНЫХ АККАУНТОВ              ");
  console.log("=======================================================\n");

  for (const res of results) {
    const userConfig = users.find((u) => u.username === res.user);
    console.log(`  Статус:  [${res.action}]`);
    console.log(`  Логин:   ${res.user}`);
    console.log(`  Пароль:  ${userConfig?.password ?? "***"}`);
    console.log(
      `  Роль:    ${res.role}${userConfig?.description ? ` (${userConfig.description})` : ""}`
    );
    console.log("-------------------------------------------------------");
  }

  console.log("\nВы можете войти под ними на странице #/login в браузере.\n");
}

seed().catch((err) => {
  console.error("Ошибка при сидировании аккаунтов:", err);
  process.exit(1);
});
