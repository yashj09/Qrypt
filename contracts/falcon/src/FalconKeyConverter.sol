// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {_ZKNOX_NTTFW_vectorized} from "ETHFALCON/ZKNOX_NTT_falcon.sol";
import {_ZKNOX_NTT_Compact, _ZKNOX_NTT_Expand} from "ETHFALCON/ZKNOX_falcon_utils.sol";

/// Turns a Falcon-512 public key from the coefficient domain (what standard signers such as noble post-quantum
/// emit) into the compact NTT-domain key the ZKNOX verifiers take. Meant to be read with a free eth_call once, when
/// an account is created.
contract FalconKeyConverter {
    function toNttKey(bytes calldata coeffKey) external pure returns (bytes memory) {
        require(coeffKey.length == 1024, "coefficient key must be 1024 bytes");
        uint256[] memory w = abi.decode(abi.encodePacked(uint256(32), uint256(32), coeffKey), (uint256[]));
        return abi.encodePacked(_ZKNOX_NTT_Compact(_ZKNOX_NTTFW_vectorized(_ZKNOX_NTT_Expand(w))));
    }
}
