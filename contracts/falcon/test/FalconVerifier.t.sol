// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {QPayFalcon8Verifier} from "../src/QPayFalcon8Verifier.sol";
import {FalconKeyConverter} from "../src/FalconKeyConverter.sol";
import {deployF1600Helper} from "../script/F1600Helper.sol";

contract FalconVerifierTest is Test {
    bytes4 internal constant MAGIC = 0x024ad318;
    bytes4 internal constant FAIL = 0xffffffff;

    QPayFalcon8Verifier internal verifier;
    bytes internal pubkey;
    bytes32[] internal hashes;
    bytes[] internal sigs;

    function setUp() public {
        address helper = deployF1600Helper(vm.parseBytes(vm.readFile("helpers/f1600_zknox.initcode.hex")));
        verifier = new QPayFalcon8Verifier(helper);
        string memory json = vm.readFile("test/fixtures/noble_vector.json");
        pubkey = new FalconKeyConverter().toNttKey(vm.parseJsonBytes(json, ".pubkeyCoeffs"));
        for (uint256 i = 0; vm.keyExistsJson(json, string.concat(".vectors[", vm.toString(i), "]")); i++) {
            string memory p = string.concat(".vectors[", vm.toString(i), "]");
            hashes.push(vm.parseJsonBytes32(json, string.concat(p, ".hash")));
            sigs.push(vm.parseJsonBytes(json, string.concat(p, ".signature")));
        }
    }

    function test_acceptsNobleSignatures() public view {
        assertGt(sigs.length, 0);
        for (uint256 i = 0; i < sigs.length; i++) {
            assertEq(verifier.verify(pubkey, hashes[i], sigs[i]), MAGIC, "valid Falcon signature accepted");
        }
    }

    function test_rejectsTampering() public view {
        bytes memory flippedSalt = bytes.concat(sigs[0]);
        flippedSalt[5] ^= 0x01;
        assertEq(verifier.verify(pubkey, hashes[0], flippedSalt), FAIL, "flipped salt rejected");

        bytes memory flippedS2 = bytes.concat(sigs[0]);
        flippedS2[500] ^= 0x01;
        assertEq(verifier.verify(pubkey, hashes[0], flippedS2), FAIL, "flipped s2 rejected");

        assertEq(verifier.verify(pubkey, keccak256("other"), sigs[0]), FAIL, "wrong digest rejected");
    }
}
