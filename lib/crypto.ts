import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("APP_SECRET must be set and should be at least 24 characters long.");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptText(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);

  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function decryptText(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");

  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
