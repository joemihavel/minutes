import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { Provider } from "@/lib/types";

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function encryptionKey() {
  const encoded = process.env.KEY_ENCRYPTION_SECRET;
  if (!encoded) throw new Error("KEY_ENCRYPTION_SECRET is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.byteLength !== 32) {
    throw new Error("KEY_ENCRYPTION_SECRET must decode to 32 bytes");
  }
  return key;
}

function associatedData(userId: string, scope: string, version: number) {
  return Buffer.from(`minutes:${userId}:${scope}:v${version}`, "utf8");
}

export function encryptSecret(plaintext: string, userId: string, scope: string): EncryptedSecret {
  const keyVersion = 1;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(associatedData(userId, scope, keyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptSecret(encrypted: EncryptedSecret, userId: string, scope: string) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(associatedData(userId, scope, encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptProviderKey(
  plaintext: string,
  userId: string,
  provider: Provider,
): EncryptedSecret {
  return encryptSecret(plaintext, userId, provider);
}

export function decryptProviderKey(
  encrypted: EncryptedSecret,
  userId: string,
  provider: Provider,
) {
  return decryptSecret(encrypted, userId, provider);
}

export function anonymousFingerprint(value: string) {
  return createHmac("sha256", encryptionKey()).update(value).digest("hex").slice(0, 32);
}
