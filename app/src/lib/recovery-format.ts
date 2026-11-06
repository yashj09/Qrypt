import { sha256, toBytes, type Address, type Hex } from "viem"

/** Shared by the browser and /api/recovery: what is stored, and the exact text the Falcon key signs to store it. */
export interface RecoveryRecord {
  v: 1
  account: Address
  iv: Hex
  ct: Hex
  prfSalt: Hex
}

export const recoveryMessage = (id: Hex, record: RecoveryRecord, ts: number) =>
  `Qrypt recovery v1\n${id}\n${record.account.toLowerCase()}\n${sha256(toBytes(JSON.stringify(record)))}\n${ts}`
