import { sha256 } from "@noble/hashes/sha2.js";

// randomUUID and SubtleCrypto are unavailable on ordinary HTTP LAN origins.
// getRandomValues remains available there; retain cryptographic randomness.
export function randomId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function") throw new Error("This browser cannot generate secure record IDs. Use a current browser.");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sha256Hex(bytes, cryptoApi = globalThis.crypto) {
  const digest = typeof cryptoApi?.subtle?.digest === "function"
    ? new Uint8Array(await cryptoApi.subtle.digest("SHA-256", bytes))
    : sha256(bytes);
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
