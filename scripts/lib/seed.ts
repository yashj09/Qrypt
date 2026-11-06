import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { bytesToHex, hexToBytes } from "@qpay/frametx";
import { STATE_DIR } from "./config.ts";

/** Loads the demo account's Falcon seed, creating it on first run. It never leaves `.qpay/`. */
export function loadSeed(): Uint8Array {
  mkdirSync(STATE_DIR, { recursive: true });
  const path = resolve(STATE_DIR, "falcon-seed.hex");
  if (!existsSync(path)) writeFileSync(path, bytesToHex(randomBytes(32)));
  return hexToBytes(readFileSync(path, "utf8").trim() as Hex);
}
