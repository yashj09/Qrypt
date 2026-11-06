// Falcon-512 via @noble/post-quantum (pure JS, fresh randomness per signature),
// re-encoded for the ZKNOX NIST verifiers. The public key comes out in the
// COEFFICIENT domain: the on-chain key is Compact(NTT(h)), computed once with
// ETHFALCON's _ZKNOX_NTTFW_vectorized (see test/NobleRoundTrip.t.sol).
import { falcon512 } from '@noble/post-quantum/falcon.js';
import { shake256 } from '@noble/hashes/sha3.js';

const N = 512;
const Q = 12289;
const SALT_LEN = 40;

function compact(coeffs) {
  const out = new Uint8Array(1024);
  for (let i = 0; i < N; i++) {
    const at = (i >> 4) * 32 + 30 - 2 * (i & 15);
    out[at] = coeffs[i] >> 8;
    out[at + 1] = coeffs[i] & 0xff;
  }
  return out;
}

function bitReader(bytes) {
  let pos = 0;
  return {
    bit: () => {
      if (pos >= bytes.length * 8) throw new Error('compressed s2 overrun');
      const b = (bytes[pos >> 3] >> (7 - (pos & 7))) & 1;
      pos++;
      return b;
    },
    rest: () => pos,
  };
}

// 0x09 || 512 x 14-bit big-endian coefficients
function decodePublicKey(pk) {
  if (pk.length !== 897 || pk[0] !== 0x09) throw new Error('expected 897-byte Falcon-512 public key');
  const r = bitReader(pk.subarray(1));
  const h = new Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let k = 0; k < 14; k++) v = (v << 1) | r.bit();
    if (v >= Q) throw new Error('public key coefficient out of range');
    h[i] = v;
  }
  return h;
}

// Falcon spec Algorithm 18 (Decompress): sign bit, 7 low bits, unary high part.
function decompressS2(bytes) {
  const r = bitReader(bytes);
  const s = new Array(N);
  for (let i = 0; i < N; i++) {
    const neg = r.bit();
    let v = 0;
    for (let k = 0; k < 7; k++) v = (v << 1) | r.bit();
    let high = 0;
    while (r.bit() === 0) if (++high > 15) throw new Error('compressed s2 coefficient too large');
    v |= high << 7;
    if (neg && v === 0) throw new Error('non-canonical -0');
    s[i] = neg ? Q - v : v;
  }
  for (let p = r.rest(); p < bytes.length * 8; p++) if ((bytes[p >> 3] >> (7 - (p & 7))) & 1) throw new Error('nonzero padding');
  return s;
}

// detached: 0x39 || nonce(40) || compressed s2  ->  nonce(40) || Compact(s2 mod q)
function toOnchainSignature(sig) {
  if (sig[0] !== 0x39) throw new Error('unexpected signature header');
  const out = new Uint8Array(SALT_LEN + 1024);
  out.set(sig.subarray(1, 1 + SALT_LEN), 0);
  out.set(compact(decompressS2(sig.subarray(1 + SALT_LEN))), SALT_LEN);
  return out;
}

export function createNobleFalconSigner(seed32) {
  if (!(seed32 instanceof Uint8Array) || seed32.length !== 32) throw new Error('seed must be 32 bytes');
  const { publicKey, secretKey } = falcon512.keygen(shake256(seed32, { dkLen: 48 }));
  return {
    rawPublicKey: publicKey,
    publicKeyCoeffs: compact(decodePublicKey(publicKey)),
    sign: (msg) => toOnchainSignature(falcon512.sign(msg, secretKey)),
  };
}
