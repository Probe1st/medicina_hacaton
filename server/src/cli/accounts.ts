import {
  createAccount,
  disableAccount,
  enableAccount,
  resetPassword,
  setRole,
  type UserRole,
} from "../accounts";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __cliDir = dirname(fileURLToPath(import.meta.url));
const __cliEnvFile = resolve(__cliDir, "../../.env");
if (existsSync(__cliEnvFile)) {
  process.loadEnvFile(__cliEnvFile);
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

function parseArgs(args: string[]): {
  command: string;
  flags: Record<string, string>;
} {
  const command = args[0] || "";
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { command, flags };
}

async function run(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const databasePath = process.env.DATABASE_PATH || "./marshrut.sqlite";

  if (!command) {
    console.error("Usage: account <create|reset-password|set-role|disable|enable> [flags]");
    process.exit(1);
  }

  const username = flags.username;
  if (!username) {
    console.error("Error: --username is required");
    process.exit(1);
  }

  switch (command) {
    case "create": {
      const role = flags.role as UserRole;
      if (!role) {
        console.error("Error: --role <patient|staff> is required for create");
        process.exit(1);
      }
      try {
        const { user, password } = await createAccount({
          databasePath,
          username,
          role,
          password: flags.password,
        });
        console.log(`Created user: ${user.username} (${user.role}) [id: ${user.id}]`);
        console.log(`Password: ${password}`);
      } catch (err) {
        console.error(`Error creating account: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }
    case "reset-password": {
      try {
        const { user, password } = await resetPassword({
          databasePath,
          username,
          password: flags.password,
        });
        console.log(`Reset password for user: ${user.username}`);
        console.log(`New password: ${password}`);
      } catch (err) {
        console.error(`Error resetting password: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }
    case "set-role": {
      const role = flags.role as UserRole;
      if (!role) {
        console.error("Error: --role <patient|staff> is required for set-role");
        process.exit(1);
      }
      try {
        const user = await setRole({
          databasePath,
          username,
          role,
        });
        console.log(`Updated role for user: ${user.username} -> ${user.role}`);
      } catch (err) {
        console.error(`Error updating role: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }
    case "disable": {
      try {
        const user = await disableAccount({
          databasePath,
          username,
        });
        console.log(`Disabled user: ${user.username}`);
      } catch (err) {
        console.error(`Error disabling account: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }
    case "enable": {
      try {
        const user = await enableAccount({
          databasePath,
          username,
        });
        console.log(`Enabled user: ${user.username}`);
      } catch (err) {
        console.error(`Error enabling account: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  }
}

run().catch((err) => {
  console.error("Unexpected CLI error:", err);
  process.exit(1);
});
