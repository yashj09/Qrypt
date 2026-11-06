// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// Deploys the ZKNOX Keccak-f[1600] helper from its init code (uses PUSH0, so Shanghai or later).
function deployF1600Helper(bytes memory initCode) returns (address helper) {
    assembly {
        helper := create(0, add(initCode, 32), mload(initCode))
    }
    require(helper != address(0), "helper CREATE failed");
}
