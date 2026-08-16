/**
 * Grayjay plugin script signing.
 *
 * Byte-compatible with the official flow from the Grayjay docs
 * (docs/Script Signing.md):
 *
 *   PUBLIC_KEY_PKCS8=$(ssh-keygen -f pub -e -m pkcs8 | header-stripped)  # base64 SPKI DER
 *   SIGNATURE=$(printf '%s' "$SCRIPT" | openssl dgst -sha512 -sign key | base64 -w 0)
 *
 * i.e. RSA-2048, SHA-512 digest, PKCS#1 v1.5 padding, signature and public
 * key base64-encoded, public key as raw X.509 SubjectPublicKeyInfo DER —
 * exactly what the app's SignatureProvider verifies and what the official
 * plugins ship in their configs.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface GeneratedKeyPair {
  /** PKCS#8 PEM private key. Keep secret; back it up. */
  privateKeyPem: string;
  /** Base64 X.509 SubjectPublicKeyInfo DER — the config's `scriptPublicKey`. */
  publicKeyBase64: string;
}

export function generateKeyPair(): GeneratedKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "der" },
  });
  return {
    privateKeyPem: privateKey as string,
    publicKeyBase64: (publicKey as Buffer).toString("base64"),
  };
}

function parsePrivateKey(privateKeyPem: string): KeyObject {
  return createPrivateKey(privateKeyPem);
}

/**
 * Sign the exact script bytes (UTF-8). The app verifies these very bytes —
 * `gj build` signs the emitted file content as-is, with no trailing-newline
 * games.
 */
export function signScript(script: string, privateKeyPem: string): string {
  const key = parsePrivateKey(privateKeyPem);
  const signature = cryptoSign("sha512", Buffer.from(script, "utf8"), key);
  return signature.toString("base64");
}

/** Verify a `scriptSignature` against a `scriptPublicKey` (base64 SPKI DER). */
export function verifyScript(script: string, signatureBase64: string, publicKeyBase64: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return cryptoVerify("sha512", Buffer.from(script, "utf8"), key, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

/** Extract the base64 SPKI public key from a PEM private or public key. */
export function publicKeyFromPem(pem: string): string {
  const key = createPublicKey(pem);
  return key.export({ type: "spki", format: "der" }).toString("base64");
}

export interface LoadedKey extends GeneratedKeyPair {
  path: string;
  created: boolean;
}

/**
 * Load a signing key, creating (and storing, chmod 600 where supported) a
 * fresh RSA-2048 key on first use. Default path: `<plugin>/.grayjay/keys/default.pem`.
 */
export async function loadOrCreateKey(path: string): Promise<LoadedKey> {
  try {
    const privateKeyPem = await readFile(path, "utf8");
    return { privateKeyPem, publicKeyBase64: publicKeyFromPem(privateKeyPem), path, created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const pair = generateKeyPair();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, pair.privateKeyPem, { mode: 0o600 });
  return { ...pair, path, created: true };
}

/** Load a key from a base64-encoded PKCS#8 PEM (e.g. a CI secret). */
export function keyFromBase64(base64Pem: string): GeneratedKeyPair {
  const privateKeyPem = Buffer.from(base64Pem, "base64").toString("utf8");
  return { privateKeyPem, publicKeyBase64: publicKeyFromPem(privateKeyPem) };
}
