import assert from "node:assert/strict";
import { getAddress } from "viem";
import { parsePaymentRequest, payLink } from "../app/src/lib/payment-request.ts";

/** What a scanned QR or opened link turns into. Run: pnpm test:pay-request */
const A = "0x000000000000000000000000000000000000dEaD";
const T = "0xd6d325bd53125d6cccb39f61e9379c8f28e3fddb";

assert.deepEqual(parsePaymentRequest(A), { to: A }, "bare address");
assert.deepEqual(parsePaymentRequest(`  ${A.toLowerCase()}  `), { to: A }, "lowercase, padded address");
assert.deepEqual(parsePaymentRequest(`https://qrypt.money/pay?to=${A}&amount=5`), { to: A, amount: "5", asset: undefined }, "pay link");
assert.deepEqual(parsePaymentRequest(`http://localhost:5180/pay?to=${A}&amount=0.25&asset=tEUR`), { to: A, amount: "0.25", asset: "tEUR" }, "any host, asset");
assert.equal(parsePaymentRequest(`https://qrypt.money/pay?to=${A}&amount=1e3`), null, "rejects odd amounts in pay links");
assert.equal(parsePaymentRequest(`https://qrypt.money/app?to=${A}`), null, "only /pay links");
assert.deepEqual(parsePaymentRequest(`ethereum:${A}@1337?value=2.5e16`), { to: A, asset: "ETH", amount: "0.025" }, "EIP-681 ETH value");
assert.deepEqual(
  parsePaymentRequest(`ethereum:${T}@1337/transfer?address=${A}&uint256=5000000`),
  { to: A, asset: getAddress(T), amount: "5" },
  "EIP-681 ERC-20 transfer, 6 decimals",
);
assert.equal(parsePaymentRequest("hello"), null, "junk");
assert.equal(payLink("https://qrypt.money", { to: A, amount: "5" }), `https://qrypt.money/pay?to=${A}&amount=5`);
assert.equal(payLink("https://qrypt.money", { to: A, asset: "tEUR" }), `https://qrypt.money/pay?to=${A}&asset=tEUR`);
const roundTrip = parsePaymentRequest(payLink("https://qrypt.money", { to: A, amount: "12.5", asset: "tEUR" }));
assert.deepEqual(roundTrip, { to: A, amount: "12.5", asset: "tEUR" }, "pay link round trip");
console.log("PASS payment requests");
