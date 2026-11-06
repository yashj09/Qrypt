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
/// The transaction carries a Falcon-512 signature in an ARBITRARY signature entry with an empty `msg`, so the
/// signature bytes are left out of the signature hash. The VERIFY frame that targets this account reads the
/// signature hash and the signature, checks them against the Falcon public key held in this account's own storage,
/// and approves execution only. Gas is paid by a separate payer frame.
///
/// The constructor stakes the account in the staking registry, because the Falcon check costs far more than the
/// unstaked validation gas budget. Staking from the constructor works because the registry keys stake off msg.sender.
contract QPayAccount is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    uint256 internal constant FALCON_SIG_LENGTH = 1064;
    bytes4 internal constant VERIFIED = ISigVerifier.verify.selector;

    ISigVerifier public immutable verifier;
    bytes public falconPubkey;

    error BadFalconSignature();
    error BadSignatureLength(uint256 length);

    constructor(ISigVerifier verifier_, bytes memory falconPubkey_, IStakingRegistry registry, uint32 unstakeDelay)
        payable
    {
        verifier = verifier_;
        falconPubkey = falconPubkey_;
        if (address(registry) != address(0)) registry.addStake{value: msg.value}(unstakeDelay);
    }

    /// The VERIFY frame whose target is this account lands here.
    fallback() external {
        uint256 length = sigparam(0, SigParam.SIGNATURE_LENGTH);
        if (length != FALCON_SIG_LENGTH) revert BadSignatureLength(length);
        bytes32 digest = bytes32(txparam(TxParam.SIG_HASH));
        bytes memory sig = sigdatacopy(0, FALCON_SIG_LENGTH, 0);
        if (!isValidFalcon(digest, sig)) revert BadFalconSignature();
        approve(Scope.EXECUTION);
    }

    function isValidFalcon(bytes32 digest, bytes memory sig) public view returns (bool) {
        return verifier.verify(falconPubkey, digest, sig) == VERIFIED;
    }
}
