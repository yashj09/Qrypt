# World ID integration debrief

## The trust event

Creating a Qrypt account is free for the user and costs us real resources: the onboarding service stakes **0.02 ETH** in the account (it needs stake for the larger validation budget) and mints **100 test USDC**, paid from an operator float. Before World ID, `/api/onboard` had no limit, so one person could drain the float with a script. The product event that needs trust is "sponsor a new account". The question it needs answered is "is this a different human from every account we've already sponsored?"

## Why Proof of Human is the minimum that's enough

| Credential | Why not, or why |
|---|---|
| **Proof of Human (Orb)** | **Chosen.** The only credential that answers "unique human". We need nothing else: no age, nationality or document data. |
| Passport (NFC) | Proves a document, not a unique person. One person can hold several passports, and each would get a sponsored account. |
| Selfie Check | Medium assurance by World's own description. Weaker sybil resistance for something that pays out value. |
| Device | Deprecated, and one person can have many devices. |

**Legacy proofs are off.** We set `allow_legacy_proofs: false`. With legacy proofs allowed, one person could claim twice, once with a v3 nullifier and once with a v4 one, unless we tracked both. World ID 4.0 only is the safe choice for a new app.

## How it works

- **Client (`app/src/components/world/use-world-proof.tsx`, `app/src/lib/world.ts`):**
  - After the Falcon key is registered and before the account is deployed, onboarding opens `IDKitRequestWidget` with `proofOfHuman({ signal })`.
  - The signal is `keccak256(Falcon public key)`, so a proof is bound to the key being sponsored.
  - On desktop the widget shows a QR code for World App; on a phone it deep-links.
  - Restoring a key the factory already knows skips World ID entirely.
- **Server (`app/api/world.ts`, `app/api/_world.ts`, `app/api/onboard.ts`):**
  - `/api/world` signs a fresh RP context with `signRequest`. The signing key exists only in the server env.
  - `/api/onboard` checks, in order:
    1. the action;
    2. the environment;
    3. the credential (Proof of Human);
    4. that the signal hash equals `hashSignal(keccak256(pubkey))`;
    5. then forwards the result to `POST https://developer.world.org/api/v4/verify/{rp_id}`.
  - It then **claims the nullifier atomically** in our private Blob store with a no-overwrite write: the first key wins, a retry for the same key is allowed, a second key from the same human gets a 409.
  - If deploying fails, the claim is released.
- **Staging now, production later:** one env var, `WORLD_ENV`. The hackathon deployment uses a staging app, so judges can verify with the World ID Simulator.

## Success and alternative paths (all tested end to end, `pnpm test:world`)

1. **Success:** the Simulator approves a World ID 4.0 Proof of Human, the server verifies it with World, and the account is deployed.
2. **The same human again:** a second fresh wallet verified by the same Simulator identity is refused: "This World ID already created a Qrypt account. Recover it with Face ID or a backup file instead."
3. **Cancelled:** closing the widget discards the never-used key and returns to the start, with create, recover (Face ID) and import (backup file) all offered again.
4. **Forged or misbound proofs:** `pnpm check:world` covers seven cases without a human:
   - no proof;
   - a bad test key;
   - another action;
   - the other environment;
   - a weaker credential;
   - a proof bound to another key;
   - a well-formed forgery, which World's verifier rejects with `all_verifications_failed`.

   It also tests the nullifier claim against the real store.

Automated suites that aren't about World ID skip it with a server-only `QRYPT_TEST_KEY` header, which is compared in constant time.

## Debrief

- **Time to first verified proof:** about an hour and a half, from reading the docs to a Simulator proof verified by the v4 endpoint and an account deployed.
- **What was smooth:**
  - The IDKit 4 types are excellent. `index.d.ts` documents every result shape and all 26 error codes.
  - `signRequest` is pure JS, so it works in a serverless function with no WASM.
  - The widget's "Testing in staging? Use the simulator" link made the Simulator easy to drive from Playwright.
- **Friction:**
  - The integrate page shows `handleVerify`, but not the `environment` prop. We found `environment: "staging"` in the types, and the Simulator only works with it.
  - The verify endpoint's response and error schema isn't documented. We discovered `{ code, detail }` (e.g. `all_verifications_failed`) by sending a forged proof.
  - The Simulator has a handful of fixed test identities, so tests that enforce one account per human have to clean up their own nullifier claims to be repeatable.
  - The docs don't say how `allow_legacy_proofs: true` interacts with uniqueness. Only a type comment warns that you must track both v3 and v4 nullifiers.
- **Missing:** a documented headless test mode, such as a signed test proof for staging. Then CI could cover the real verification without driving a browser Simulator.
- **The single most useful improvement:** document the `/api/v4/verify` response and error codes next to the integration guide.
