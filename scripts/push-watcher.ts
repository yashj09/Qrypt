// Payment notifications. Runs on the laptop next to the sidecar:
//   nohup pnpm push-watcher > .qpay/push-watcher.log 2>&1 < /dev/null & disown
//
// Every minute it reloads the push subscriptions that accounts registered through /api/push (private Vercel Blob).
// Every few seconds it reads new `Transfer` logs to those accounts (any ERC-20, and ETH through the EIP-7708 system
// address) and sends each subscribed browser a Web Push. Subscriptions the push service reports gone are deleted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { del, get, list } from "@vercel/blob";
import webpush, { WebPushError } from "web-push";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, parseAbiItem, zeroAddress, type Address } from "viem";
import { isPushEndpoint, PUSH_PREFIX, type PushRecord } from "../app/src/lib/push-format.ts";
import { ROOT, STATE_DIR } from "./lib/config.ts";

process.loadEnvFile(resolve(STATE_DIR, "push.env"));
if (existsSync(resolve(ROOT, ".env.local"))) process.loadEnvFile(resolve(ROOT, ".env.local"));
for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "BLOB_READ_WRITE_TOKEN"]) {
  if (!process.env[name]) throw new Error(`${name} is missing (.qpay/push.env, .env.local)`);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://qrypt.money", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

const RPC = process.env.QPAY_NODE_RPC ?? "https://altmempool.forshtat.com";
const STATE_FILE = process.env.QRYPT_PUSH_STATE ?? resolve(STATE_DIR, "push-watcher.json");
const POLL_MS = 4_000;
const REFRESH_MS = Number(process.env.QRYPT_PUSH_REFRESH_MS ?? 60_000);
const MAX_RANGE = 500n;
/** After downtime, catch up at most this far back rather than notifying about old payments. */
const MAX_CATCH_UP = 1_000n;
const ETH_LOG_ADDRESS = "0xfffffffffffffffffffffffffffffffffffffffe";

const client = createPublicClient({ transport: http(RPC) });
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// --- subscriptions ---------------------------------------------------------------------------------------------

/** Lowercase account -> its subscriptions, keyed by blob pathname. Records are immutable, so each is fetched once. */
let byAccount = new Map<string, Map<string, PushRecord>>();

async function refreshSubscriptions() {
  const next = new Map<string, Map<string, PushRecord>>();
  const known = new Map([...byAccount.values()].flatMap((m) => [...m]));
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PUSH_PREFIX, cursor });
    for (const blob of page.blobs) {
      let record = known.get(blob.pathname);
      if (!record) {
        const got = await get(blob.pathname, { access: "private", useCache: false });
        if (!got || got.statusCode !== 200) continue;
        record = JSON.parse(await new Response(got.stream).text()) as PushRecord;
      }
      if (!isPushEndpoint(record.subscription.endpoint)) {
        await del(blob.pathname);
        continue;
      }
      const account = record.account.toLowerCase();
      if (!next.has(account)) next.set(account, new Map());
      next.get(account)!.set(blob.pathname, record);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const before = [...byAccount.values()].reduce((n, m) => n + m.size, 0);
  byAccount = next;
  const after = [...next.values()].reduce((n, m) => n + m.size, 0);
  if (after !== before) log(`${after} subscription(s) for ${next.size} account(s)`);
}

// --- token metadata --------------------------------------------------------------------------------------------

const tokens = new Map<string, { symbol: string; decimals: number } | null>();

async function tokenInfo(address: Address) {
  const key = address.toLowerCase();
  if (key === ETH_LOG_ADDRESS) return { symbol: "ETH", decimals: 18 };
  if (!tokens.has(key)) {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]).catch(() => [null, null]);
    tokens.set(key, symbol === null || decimals === null ? null : { symbol, decimals });
  }
  return tokens.get(key)!;
}

const amount = (value: bigint, decimals: number) =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

// --- delivery --------------------------------------------------------------------------------------------------

async function notify(account: string, payload: { title: string; body: string; tag: string; url: string }) {
  const subs = byAccount.get(account);
  if (!subs) return;
  await Promise.all(
    [...subs].map(async ([pathname, record]) => {
      try {
        await webpush.sendNotification(record.subscription, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
        log(`pushed "${payload.title}" to ${short(account)} (${new URL(record.subscription.endpoint).hostname})`);
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          subs.delete(pathname);
          await del(pathname);
          log(`dropped an expired subscription for ${short(account)}`);
        } else {
          log(`push to ${short(account)} failed: ${(e as Error).message}`);
        }
      }
    }),
  );
}

// --- chain -----------------------------------------------------------------------------------------------------

function loadCursor(): bigint | null {
  if (!existsSync(STATE_FILE)) return null;
  return BigInt((JSON.parse(readFileSync(STATE_FILE, "utf8")) as { lastBlock: string }).lastBlock);
}
const saveCursor = (block: bigint) => writeFileSync(STATE_FILE, JSON.stringify({ lastBlock: block.toString() }));

async function poll(last: bigint): Promise<bigint> {
  const head = await client.getBlockNumber();
  if (head <= last) return last;
  if (byAccount.size === 0) return head; // nobody to notify: skip ahead
  const from = last + 1n;
  const to = head - from >= MAX_RANGE ? from + MAX_RANGE - 1n : head;
  const logs = await client.getLogs({
    event: transfer,
    args: { to: [...byAccount.keys()].map((a) => getAddress(a)) },
    fromBlock: from,
    toBlock: to,
  });
  for (const l of logs) {
    // ERC-721 Transfers share the topic but index the token id: four topics, no value.
    if (l.topics.length !== 3 || l.args.value === undefined || !l.args.to || !l.args.from) continue;
    if (l.args.value === 0n || l.args.from.toLowerCase() === l.args.to.toLowerCase()) continue;
    const token = await tokenInfo(l.address);
    if (!token) continue;
    const from = l.args.from === zeroAddress ? "a mint" : short(l.args.from);
    await notify(l.args.to.toLowerCase(), {
      title: `Received ${amount(l.args.value, token.decimals)} ${token.symbol}`,
      body: `From ${from} · block ${l.blockNumber}`,
      tag: `${l.transactionHash}-${l.logIndex}`,
      url: "/app#activity",
    });
  }
  return to;
}

async function main() {
  const head = await client.getBlockNumber();
  const saved = loadCursor();
  let last = saved === null || head - saved > MAX_CATCH_UP ? head : saved;
  log(`watching ${RPC} from block ${last + 1n}`);
  await refreshSubscriptions();
  let refreshedAt = Date.now();
  for (;;) {
    try {
      if (Date.now() - refreshedAt > REFRESH_MS) {
        await refreshSubscriptions();
        refreshedAt = Date.now();
      }
      const next = await poll(last);
      if (next !== last) saveCursor((last = next));
    } catch (e) {
      log(`error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void main();
