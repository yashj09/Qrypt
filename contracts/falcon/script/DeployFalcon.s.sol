// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {QPayFalcon8Verifier} from "../src/QPayFalcon8Verifier.sol";
import {FalconKeyConverter} from "../src/FalconKeyConverter.sol";
import {deployF1600Helper} from "./F1600Helper.sol";

/// Deploys the Keccak-f[1600] helper, the Falcon-512 verifier and the key converter. Writes their addresses to
/// ../../deployments/falcon-<chainId>.json.
contract DeployFalcon is Script {
    function run() external {
        vm.startBroadcast();
        address helper = deployF1600Helper(vm.parseBytes(vm.readFile("helpers/f1600_zknox.initcode.hex")));
        QPayFalcon8Verifier verifier = new QPayFalcon8Verifier(helper);
        FalconKeyConverter converter = new FalconKeyConverter();
        vm.stopBroadcast();

        string memory json = "falcon";
        vm.serializeAddress(json, "f1600Helper", helper);
        vm.serializeAddress(json, "keyConverter", address(converter));
        string memory out = vm.serializeAddress(json, "verifier", address(verifier));
        vm.writeJson(out, string.concat("../../deployments/falcon-", vm.toString(block.chainid), ".json"));
        console.log("verifier", address(verifier));
    }
}
