import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databasePath: string;
  publicOrigin: string;
  staticRoot: string;
  trustProxy: boolean | string;
}

const LOOPBACK_HOSTS: Record<string, true> = {
  "127.0.0.1": true,
  localhost: true,
  "::1": true,
  "[::1]": true,
};

export function parsePublicOrigin(rawOrigin: string, nodeEnv: "development" | "test" | "production"): string {
  if (!rawOrigin || typeof rawOrigin !== "string") {
    throw new Error("PUBLIC_ORIGIN must be a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error(`Invalid PUBLIC_ORIGIN URL: ${rawOrigin}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("PUBLIC_ORIGIN cannot contain credentials");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("PUBLIC_ORIGIN cannot contain query or hash components");
  }

  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("PUBLIC_ORIGIN must have an empty path or root path '/'");
  }

  if (nodeEnv === "production") {
    if (parsed.protocol !== "https:") {
      throw new Error(`Production PUBLIC_ORIGIN must use https: protocol, got ${parsed.protocol}`);
    }
  } else {
    if (parsed.protocol === "http:" && !LOOPBACK_HOSTS[parsed.hostname]) {
      throw new Error(`HTTP PUBLIC_ORIGIN in ${nodeEnv} is only permitted for loopback hosts, got ${parsed.hostname}`);
    }
  }

  return parsed.origin;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnvRaw = env.NODE_ENV || "development";
  if (nodeEnvRaw !== "development" && nodeEnvRaw !== "test" && nodeEnvRaw !== "production") {
    throw new Error(`Invalid NODE_ENV: ${nodeEnvRaw}`);
  }
  const nodeEnv = nodeEnvRaw;

  const port = parseInt(env.PORT || "4173", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const databasePath =
    env.DATABASE_PATH || (nodeEnv === "development" ? "./marshrut.sqlite" : undefined);
  if (!databasePath || !databasePath.trim()) {
    throw new Error("DATABASE_PATH environment variable is required");
  }

  const defaultDevOrigin = port === 3001 ? "http://127.0.0.1:5173" : `http://127.0.0.1:${port}`;
  const publicOriginRaw =
    env.PUBLIC_ORIGIN || (nodeEnv === "development" ? defaultDevOrigin : undefined);
  if (!publicOriginRaw || !publicOriginRaw.trim()) {
    throw new Error("PUBLIC_ORIGIN environment variable is required");
  }
  const publicOrigin = parsePublicOrigin(publicOriginRaw.trim(), nodeEnv);

  const staticRoot = resolve(__dirname, "../../web/dist");

  // In production behind reverse proxy, trust loopback proxy only
  const trustProxy = nodeEnv === "production" ? "127.0.0.1" : false;

  return {
    nodeEnv,
    port,
    databasePath: databasePath.trim(),
    publicOrigin,
    staticRoot,
    trustProxy,
  };
}
