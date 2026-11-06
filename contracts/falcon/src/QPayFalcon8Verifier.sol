// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {falcon_core8} from "ETHFALCON/ZKNOX_falcon_core8.sol";

/// @notice ERC-7913-style Falcon-512 (NIST, SHAKE256) verifier over ZKNOX_falcon8's core,
///         taking the raw compact public key per call. Same encodings as QPayFalconVerifier.
/// @dev pubkey: 1024 bytes = 32 big-endian words, 16 NTT-domain coefficients of 16 bits each.
///      sig: 1064 bytes = salt (40) || s2 as 32 big-endian words in the same compact layout.
contract QPayFalcon8Verifier {
    /// keccak256 of the ZKNOX Keccak-f[1600] helper runtime (ETHFALCON test/f1600_zknox.hex).
    bytes32 public constant F1600_CODEHASH = 0x661c9f13236c0174873874530946d802d0ac54373091f0bdea36ab2e3f409155;
    bytes4 internal constant MAGIC = 0x024ad318; // bytes4(keccak256("verify(bytes,bytes32,bytes)"))
    uint256 internal constant PUBKEY_LEN = 1024;
    uint256 internal constant SALT_LEN = 40;
    uint256 internal constant SIG_LEN = SALT_LEN + 1024;

    address public immutable f1600Helper;

    error BadHelper();

    constructor(address helper) {
        if (helper.codehash != F1600_CODEHASH) revert BadHelper();
        f1600Helper = helper;
    }

    function verify(bytes calldata pubkey, bytes32 digest, bytes calldata sig) external view returns (bytes4) {
        if (pubkey.length != PUBKEY_LEN || sig.length != SIG_LEN) return 0xffffffff;
        // Binding by content, as ZKNOX_falcon8 does: an address alone does not pin what SHAKE256 means.
        if (f1600Helper.codehash != F1600_CODEHASH) revert BadHelper();

        uint256[] memory ntth = _words(pubkey);
        uint256[] memory s2 = _words(sig[SALT_LEN:]);
        bytes memory salt = sig[:SALT_LEN];

        return falcon_core8(salt, abi.encodePacked(digest), f1600Helper, s2, ntth) ? MAGIC : bytes4(0xffffffff);
    }

    function _words(bytes calldata b) private pure returns (uint256[] memory w) {
        w = new uint256[](32);
        assembly ("memory-safe") {
            calldatacopy(add(w, 32), b.offset, 1024)
        }
    }
}
