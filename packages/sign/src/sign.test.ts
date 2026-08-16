import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { generateKeyPair, keyFromBase64, loadOrCreateKey, signScript, verifyScript } from "./index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function hasOpenssl(): Promise<boolean> {
  const proc = await $`openssl version`.quiet().nothrow();
  return proc.exitCode === 0;
}

const SCRIPT = 'console.log("hello grayjay");\nsource.getHome = () => new VideoPager([], false);\n';

describe("sign/verify roundtrip", () => {
  test("verify accepts own signature", () => {
    const { privateKeyPem, publicKeyBase64 } = generateKeyPair();
    const signature = signScript(SCRIPT, privateKeyPem);
    expect(verifyScript(SCRIPT, signature, publicKeyBase64)).toBe(true);
  });

  test("verify rejects tampered script", () => {
    const { privateKeyPem, publicKeyBase64 } = generateKeyPair();
    const signature = signScript(SCRIPT, privateKeyPem);
    expect(verifyScript(SCRIPT + " ", signature, publicKeyBase64)).toBe(false);
    expect(verifyScript(SCRIPT.replace("hello", "goodbye"), signature, publicKeyBase64)).toBe(false);
  });

  test("verify rejects wrong key and garbage", () => {
    const { privateKeyPem } = generateKeyPair();
    const other = generateKeyPair();
    const signature = signScript(SCRIPT, privateKeyPem);
    expect(verifyScript(SCRIPT, signature, other.publicKeyBase64)).toBe(false);
    expect(verifyScript(SCRIPT, "not-base64!!!", other.publicKeyBase64)).toBe(false);
    expect(verifyScript(SCRIPT, signature, "AAAA")).toBe(false);
  });

  test("public key format matches official configs (base64 SPKI, ~392 chars)", () => {
    const { publicKeyBase64 } = generateKeyPair();
    expect(publicKeyBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // Official YouTube/Odysee keys are 2048-bit RSA SPKI DER = 294 bytes -> 392 base64 chars.
    expect(publicKeyBase64.length).toBe(392);
  });
});

const opensslAvailable = await hasOpenssl();

describe("openssl compatibility (the flow the Android app verifies)", () => {
  test.skipIf(!opensslAvailable)("our signature verifies with openssl", async () => {
    const { privateKeyPem, publicKeyBase64 } = generateKeyPair();
    const signature = signScript(SCRIPT, privateKeyPem);

    const dir = await mkdtemp(join(tmpdir(), "gjsign-"));
    try {
      const scriptPath = join(dir, "script.js");
      const sigPath = join(dir, "sig.bin");
      const pubPath = join(dir, "pub.pem");
      await Bun.write(scriptPath, SCRIPT);
      await Bun.write(sigPath, Buffer.from(signature, "base64"));
      // Reconstruct a PEM public key from the base64 SPKI we put in configs.
      const pem = `-----BEGIN PUBLIC KEY-----\n${(publicKeyBase64.match(/.{1,64}/g) ?? []).join("\n")}\n-----END PUBLIC KEY-----\n`;
      await Bun.write(pubPath, pem);

      const proc = await $`openssl dgst -sha512 -verify ${pubPath} -signature ${sigPath} ${scriptPath}`.quiet().nothrow();
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString()).toContain("Verified OK");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(!opensslAvailable)("openssl-produced signature verifies with our code", async () => {
    // Exactly the official sign-script.sh flow: openssl dgst -sha512 -sign.
    const { privateKeyPem, publicKeyBase64 } = generateKeyPair();

    const dir = await mkdtemp(join(tmpdir(), "gjsign-"));
    try {
      const keyPath = join(dir, "key.pem");
      const scriptPath = join(dir, "script.js");
      await Bun.write(keyPath, privateKeyPem);
      await Bun.write(scriptPath, SCRIPT);

      const proc = await $`openssl dgst -sha512 -sign ${keyPath} -out ${join(dir, "sig.bin")} ${scriptPath}`.quiet().nothrow();
      expect(proc.exitCode).toBe(0);
      const sig = await Bun.file(join(dir, "sig.bin")).arrayBuffer();
      const signatureBase64 = Buffer.from(sig).toString("base64");
      expect(verifyScript(SCRIPT, signatureBase64, publicKeyBase64)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(!opensslAvailable)("signature matches openssl byte-for-byte", async () => {
    const { privateKeyPem } = generateKeyPair();
    const dir = await mkdtemp(join(tmpdir(), "gjsign-"));
    try {
      const keyPath = join(dir, "key.pem");
      const scriptPath = join(dir, "script.js");
      await Bun.write(keyPath, privateKeyPem);
      await Bun.write(scriptPath, SCRIPT);
      await $`openssl dgst -sha512 -sign ${keyPath} -out ${join(dir, "sig.bin")} ${scriptPath}`.quiet();
      const opensslSig = Buffer.from(await Bun.file(join(dir, "sig.bin")).arrayBuffer()).toString("base64");
      expect(signScript(SCRIPT, privateKeyPem)).toBe(opensslSig);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("key management", () => {
  test("loadOrCreateKey creates then reloads the same key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gjkey-"));
    try {
      const keyPath = join(dir, "nested", "default.pem");
      const first = await loadOrCreateKey(keyPath);
      expect(first.created).toBe(true);
      const second = await loadOrCreateKey(keyPath);
      expect(second.created).toBe(false);
      expect(second.publicKeyBase64).toBe(first.publicKeyBase64);

      // A script signed with the reloaded key verifies against the created key.
      expect(verifyScript(SCRIPT, signScript(SCRIPT, second.privateKeyPem), first.publicKeyBase64)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("keyFromBase64 roundtrips CI-secret style keys", () => {
    const { privateKeyPem, publicKeyBase64 } = generateKeyPair();
    const secret = Buffer.from(privateKeyPem).toString("base64");
    const loaded = keyFromBase64(secret);
    expect(loaded.publicKeyBase64).toBe(publicKeyBase64);
  });
});
