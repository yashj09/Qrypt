// @ts-expect-error plain ESM module without type declarations
import { createNobleFalconSigner } from "./noble-signer.mjs";

export interface FalconSigner {
  /** 897-byte NIST public key, `0x09 || 512 x 14-bit` coefficients. */
  rawPublicKey: Uint8Array;
  /** Coefficient-domain key in the ZKNOX compact layout; convert once with FalconKeyConverter.toNttKey. */
  publicKeyCoeffs: Uint8Array;
  /** Signs a message (the 32-byte frame tx signature hash) and returns `salt(40) || compact(s2)`, 1064 bytes. */
  sign(message: Uint8Array): Uint8Array;
}

/** Falcon-512 keypair derived from a 32-byte seed. Each signature uses fresh randomness. */
export const falconFromSeed = (seed32: Uint8Array): FalconSigner => createNobleFalconSigner(seed32);
