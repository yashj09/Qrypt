// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {Scope, TxParam, SigParam} from "@forshtat/hegota-support/contracts/Params.sol";

/// ERC-7913 style verifier, as exposed by the ZKNOX Falcon verifiers.
interface ISigVerifier {
    function verify(bytes calldata pubkey, bytes32 digest, bytes calldata sig) external view returns (bytes4);
}

interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
}

/// A post-quantum smart account for EIP-8141 frame transactions. It has no ECDSA path.
///
/// Every action is a SENDER frame of a transaction this account approved in VERIFY, so the account itself needs no
/// `execute` function: a SENDER frame already calls its target with `msg.sender == address(this)`. The only functions
/// here are the ones that change the account itself, and they accept calls only from the account.
///
/// The transaction carries a Falcon-512 signature in an ARBITRARY signature entry with an empty `msg`, so the
/// signature bytes are left out of the signature hash. The VERIFY frame that targets this account reads the
/// signature hash and the signature, checks them against the Falcon public key held in this account's own storage,
/// and approves execution only. Gas is paid by a separate payer frame.
///
/// The constructor stakes the account in the staking registry, because the Falcon check costs far more than the
/// unstaked validation gas budget. Staking from the constructor works because the registry keys stake off msg.sender.
contract QPayAccount is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    uint256 internal constant FALCON_SIG_LENGTH = 1064;
    uint256 internal constant FALCON_NTT_KEY_LENGTH = 1024;
    bytes4 internal constant VERIFIED = ISigVerifier.verify.selector;
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    ISigVerifier public immutable verifier;
    bytes public falconPubkey;

    error BadFalconSignature();
    error BadSignatureLength(uint256 length);
    error BadKeyLength(uint256 length);
    error OnlySelf();

    event KeyRotated(bytes32 indexed oldKeyHash, bytes32 indexed newKeyHash);

    constructor(ISigVerifier verifier_, bytes memory falconPubkey_, IStakingRegistry registry, uint32 unstakeDelay)
        payable
    {
        verifier = verifier_;
        falconPubkey = falconPubkey_;
        if (address(registry) != address(0)) registry.addStake{value: msg.value}(unstakeDelay);
    }

    /// The VERIFY frame whose target is this account lands here.
    fallback() external {
        _verifyFrame();
    }

    /// Solidity routes every call with empty calldata to `receive`, even with no ETH attached. The VERIFY frame has
    /// empty data, so a zero-value call is the signature check, and anything with value is someone paying us.
    receive() external payable {
        if (msg.value == 0) _verifyFrame();
    }

    function _verifyFrame() internal {
        uint256 length = sigparam(0, SigParam.SIGNATURE_LENGTH);
        if (length != FALCON_SIG_LENGTH) revert BadSignatureLength(length);
        bytes32 digest = bytes32(txparam(TxParam.SIG_HASH));
        bytes memory sig = sigdatacopy(0, FALCON_SIG_LENGTH, 0);
        if (!isValidFalcon(digest, sig)) revert BadFalconSignature();
        approve(Scope.EXECUTION);
    }

    /// Replaces the Falcon key. Reachable only from a SENDER frame targeting this account, so the current key signs
    /// the rotation. Takes effect for the next transaction: this one was already approved in VERIFY.
    function rotateKey(bytes calldata newNttPubkey) external {
        if (msg.sender != address(this)) revert OnlySelf();
        if (newNttPubkey.length != FALCON_NTT_KEY_LENGTH) revert BadKeyLength(newNttPubkey.length);
        emit KeyRotated(keccak256(falconPubkey), keccak256(newNttPubkey));
        falconPubkey = newNttPubkey;
    }

    /// ERC-1271: lets dapps check a Falcon signature over an EIP-191 or EIP-712 hash, e.g. for sign-in.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != FALCON_SIG_LENGTH) return 0xffffffff;
        return isValidFalcon(hash, signature) ? ERC1271_MAGIC : bytes4(0xffffffff);
    }

    function isValidFalcon(bytes32 digest, bytes memory sig) public view returns (bool) {
        return verifier.verify(falconPubkey, digest, sig) == VERIFIED;
    }
}
