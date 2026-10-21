import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, resetPassword, type UserRole } from "../accounts";
import { openDatabase } from "../db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dirname, "../../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databasePath = process.env.DATABASE_PATH || "./marshrut.sqlite";

interface SeedUserConfig {
  username: string;
  role: UserRole;
  password: string;
  description: string;
}

const SEED_USERS: SeedUserConfig[] = [
  {
    username: "patient_demo",
    role: "patient",
    password: "patient123",
    description: "Учебный пациент (просмотр и отметка задач, барьеры, напоминания)",
  },
  {
    username: "staff_demo",
    role: "staff",
    password: "staff123",
    description: "Сотрудник стенда (все права пациента + генерация QR и выдача памяток)",
  },
];

async function seed(): Promise<void> {
  console.log(`\nИнициализация базы данных: ${databasePath}`);

  const db = openDatabase(databasePath);
  const processed: { user: string; role: string; password: string; description: string; action: string }[] = [];

  try {
    for (const item of SEED_USERS) {
      const row = db.prepare("SELECT id FROM users WHERE username = ?").get(item.username);
      if (row) {
        await resetPassword({
          databasePath,
          username: item.username,
          password: item.password,
        });
        processed.push({
          user: item.username,
          role: item.role,
          password: item.password,
          description: item.description,
          action: "обновлён",
        });
      } else {
        await createAccount({
          databasePath,
          username: item.username,
          role: item.role,
          password: item.password,
        });
        processed.push({
          user: item.username,
          role: item.role,
          password: item.password,
          description: item.description,
          action: "создан",
        });
      }
    }
  } finally {
    db.close();
  }

  console.log("\n=======================================================");
  console.log("            СИДИРОВАНИЕ УЧЕБНЫХ АККАУНТОВ              ");
  console.log("=======================================================\n");

  for (const c of processed) {
    console.log(`  Статус:  [${c.action}]`);
    console.log(`  Логин:   ${c.user}`);
    console.log(`  Пароль:  ${c.password}`);
    console.log(`  Роль:    ${c.role} (${c.description})`);
    console.log("-------------------------------------------------------");
  }

  console.log("\nВы можете войти под ними на странице #/login в браузере.\n");
}

seed().catch((err) => {
  console.error("Ошибка при сидировании аккаунтов:", err);
  process.exit(1);
});
