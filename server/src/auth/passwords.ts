import { Buffer } from "node:buffer";
import argon2 from "argon2";
import { ARGON2_OPTIONS } from "../accounts";

export interface PasswordVerificationResult {
  valid: boolean;
  rateLimited?: boolean;
  retryAfter?: number;
}

let activeArgon2Checks = 0;
const MAX_CONCURRENT_ARGON2 = 4;

let dummyHashPromise: Promise<string> | null = null;

export async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    // A pre-computed dummy hash using the exact same argon2id parameters
    dummyHashPromise = argon2.hash("dummy-credential-for-timing", ARGON2_OPTIONS);
  }
  return dummyHashPromise;
}

export function validateNewPassword(password: unknown): string {
  if (typeof password !== "string") {
    throw new Error("New password must be a string");
  }
  const charCount = [...password].length;
  if (charCount < 15 || charCount > 128) {
    throw new Error("Password must be between 15 and 128 characters");
  }
  if (Buffer.byteLength(password, "utf8") > 1024) {
    throw new Error("Password must not exceed 1024 bytes");
  }
  return password;
}

export async function verifyPasswordThrottled(
  hash: string,
  candidate: string
): Promise<PasswordVerificationResult> {
  if (activeArgon2Checks >= MAX_CONCURRENT_ARGON2) {
    return { valid: false, rateLimited: true, retryAfter: 1 };
  }

  activeArgon2Checks++;
  try {
    const valid = await argon2.verify(hash, candidate);
    return { valid };
  } catch {
    return { valid: false };
  } finally {
    activeArgon2Checks--;
  }
}
