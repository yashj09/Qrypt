import { encodeFunctionData, keccak256, parseAbi, type Address, type Hex } from "viem"
import { erc20Transfer, type Call } from "@qpay/frametx"
import { client, estimateFee, newSeed, nttKeyOf, storeAccount, type Deployment } from "@/lib/qpay"
import { keyStore } from "@/lib/keystore"
import { assetKey, usdcAsset, type Asset, type Holdings } from "@/lib/assets"

const accountAbi = parseAbi(["function falconPubkey() view returns (bytes)", "function rotateKey(bytes newNttPubkey)"])
const registryAbi = parseAbi(["function unlockStake()", "function withdrawStake(address withdrawAddress)"])

const PBKDF2_ITERATIONS = 600_000

/** Proves a seed controls an account by comparing its NTT key with the one the account stores. */
export async function seedControls(d: Deployment, account: Address, seed: Hex): Promise<boolean> {
  const [onchain, mine] = await Promise.all([
    client.readContract({ address: account, abi: accountAbi, functionName: "falconPubkey" }),
    nttKeyOf(d, seed),
  ])
  return keccak256(onchain) === keccak256(mine)
}

// ---------------------------------------------------------------------------------------------- backup --------

export interface KeyBackup {
  v: 1
  kind: "eyrie-key-backup"
  chainId: number
  factory: Address
  account: Address
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: Hex }
  cipher: { name: "AES-GCM"; iv: Hex }
  ciphertext: Hex
}

const toHex = (b: ArrayBuffer | Uint8Array) =>
  `0x${Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex
const fromHex = (h: Hex): Uint8Array<ArrayBuffer> => Uint8Array.from(h.slice(2).match(/../g) ?? [], (x) => parseInt(x, 16))

async function aesKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function createBackup(d: Deployment, account: Address, password: string): Promise<KeyBackup> {
  const seed = await keyStore().seed()
  if (!seed) throw new Error("There's no unlocked Falcon key to back up.")
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await aesKey(password, salt, PBKDF2_ITERATIONS)
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, fromHex(seed))
  return {
    v: 1,
    kind: "eyrie-key-backup",
    chainId: d.chainId,
    factory: d.factory,
    account,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toHex(salt) },
    cipher: { name: "AES-GCM", iv: toHex(iv) },
    ciphertext: toHex(ciphertext),
  }
}

export function downloadBackup(backup: KeyBackup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: `eyrie-key-${backup.account.slice(2, 8)}.json` })
  a.click()
  URL.revokeObjectURL(url)
}

/** Decrypts a backup and checks onchain that the key still controls the account. Doesn't store anything. */
export async function openBackup(d: Deployment, file: File, password: string): Promise<{ account: Address; seed: Hex }> {
  let backup: KeyBackup
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't an Eyrie key backup.")
  }
  if (backup.kind !== "eyrie-key-backup" || backup.v !== 1) throw new Error("That file isn't an Eyrie key backup.")
  if (backup.chainId !== d.chainId) throw new Error(`This backup is for chain ${backup.chainId}, not ${d.chainId}.`)
  let seed: Hex
  try {
    const key = await aesKey(password, fromHex(backup.kdf.salt), backup.kdf.iterations)
    seed = toHex(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(backup.cipher.iv) }, key, fromHex(backup.ciphertext)))
  } catch {
    throw new Error("Wrong password, or the file was changed.")
  }
  if (!(await seedControls(d, backup.account, seed))) {
    throw new Error("This key no longer controls the account. It may have been rotated since the backup.")
  }
  return { account: backup.account, seed }
}

/** Opens a backup and makes its key and account this wallet's. */
export async function restoreBackup(d: Deployment, file: File, password: string): Promise<Address> {
  const { account, seed } = await openBackup(d, file, password)
  await keyStore().save(seed)
  storeAccount(d, account)
  return account
}

// ---------------------------------------------------------------------------------------------- rotation ------

/**
 * A fresh key and the call that installs it. The new seed is parked as pending, so a closed tab can't lose it
 * between signing the rotation and its inclusion.
 */
export async function prepareRotation(d: Deployment, account: Address): Promise<Call> {
  const seed = newSeed()
  const ntt = await nttKeyOf(d, seed)
  await keyStore().pending.set(seed)
  return {
    to: account,
    data: encodeFunctionData({ abi: accountAbi, functionName: "rotateKey", args: [ntt] }),
    label: "Rotate Falcon key",
    gas: { execution: 400_000n, state: 400_000n },
  }
}

/** Promotes the pending key once the chain says it's the account's key; drops it if the rotation never landed. */
export async function settleRotation(d: Deployment, account: Address): Promise<"rotated" | "unchanged"> {
  const store = keyStore()
  const pending = await store.pending.get()
  if (!pending) return "unchanged"
  if (await seedControls(d, account, pending)) {
    await store.save(pending)
    await store.pending.set(null)
    return "rotated"
  }
  const current = await store.seed()
  if (current && (await seedControls(d, account, current))) await store.pending.set(null)
  return "unchanged"
}

// ---------------------------------------------------------------------------------------------- closing -------

/**
 * Unstakes and sweeps everything to `to` in one transaction. Both registry calls fit in one transaction because the
 * account's unstake delay is 0. USDC is swept last and keeps back exactly the fee this transaction pays.
 */
export function closeAccountCalls(d: Deployment, account: Address, to: Address, assets: Asset[], holdings: Holdings): Call[] {
  const usdcKey = assetKey(usdcAsset(d))
  const base: Call[] = [
    { to: d.stakingRegistry, data: encodeFunctionData({ abi: registryAbi, functionName: "unlockStake" }), label: "Unlock stake" },
    {
      to: d.stakingRegistry,
      data: encodeFunctionData({ abi: registryAbi, functionName: "withdrawStake", args: [to] }),
      label: "Withdraw stake",
    },
    ...assets
      .filter((a) => assetKey(a) !== usdcKey && (holdings[assetKey(a)] ?? 0n) > 0n)
      .map((a): Call =>
        a.kind === "eth"
          ? { to, value: holdings.eth, label: "Sweep ETH" }
          : { to: a.address, data: erc20Transfer(to, holdings[assetKey(a)]), label: `Sweep ${a.symbol}` },
      ),
  ]
  const usdcBalance = holdings[usdcKey] ?? 0n
  const sweepUsdc = (amount: bigint): Call => ({ to: d.usdc, data: erc20Transfer(to, amount), label: "Sweep USDC" })
  const fee = estimateFee(d, account, [...base, sweepUsdc(usdcBalance)])
  return usdcBalance > fee ? [...base, sweepUsdc(usdcBalance - fee)] : base
}
