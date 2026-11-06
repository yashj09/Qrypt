// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {QPayAccount, ISigVerifier, IStakingRegistry} from "../src/QPayAccount.sol";

/// Accepts exactly one (key, digest, signature) triple, so the tests can tell a good signature from a bad one.
contract FakeVerifier is ISigVerifier {
    bytes32 public goodKey;
    bytes32 public goodDigest;
    bytes32 public goodSig;

    function accept(bytes calldata key, bytes32 digest, bytes calldata sig) external {
        goodKey = keccak256(key);
        goodDigest = digest;
        goodSig = keccak256(sig);
    }

    function verify(bytes calldata pubkey, bytes32 digest, bytes calldata sig) external view returns (bytes4) {
        bool ok = keccak256(pubkey) == goodKey && digest == goodDigest && keccak256(sig) == goodSig;
        return ok ? ISigVerifier.verify.selector : bytes4(0);
    }
}

contract QPayAccountTest is Test {
    FakeVerifier verifier;
    QPayAccount account;
    bytes key = new bytes(1024);
    bytes sig = new bytes(1064);
    bytes32 digest = keccak256("hello");

    function setUp() public {
        key[0] = 0x01;
        sig[0] = 0x02;
        verifier = new FakeVerifier();
        account = new QPayAccount(verifier, key, IStakingRegistry(address(0)), 0);
    }

    function test_receivesEth() public {
        (bool ok,) = payable(address(account)).call{value: 1 ether}("");
        assertTrue(ok, "plain ETH transfer accepted");
        assertEq(address(account).balance, 1 ether);
    }

    function test_erc1271AcceptsOnlyTheRightSignature() public {
        verifier.accept(key, digest, sig);
        assertEq(account.isValidSignature(digest, sig), bytes4(0x1626ba7e), "valid signature returns the magic value");
        assertEq(account.isValidSignature(keccak256("other"), sig), bytes4(0xffffffff), "other digest is rejected");
        assertEq(account.isValidSignature(digest, new bytes(10)), bytes4(0xffffffff), "wrong length is rejected");
    }

    function test_rotateKeyOnlyFromTheAccountItself() public {
        bytes memory next = new bytes(1024);
        next[0] = 0x03;
        vm.expectRevert(QPayAccount.OnlySelf.selector);
        account.rotateKey(next);

        vm.prank(address(account));
        account.rotateKey(next);
        assertEq(keccak256(account.falconPubkey()), keccak256(next), "key replaced");
    }

    function test_rotatedKeyIsTheOneThatVerifies() public {
        verifier.accept(key, digest, sig);
        bytes memory next = new bytes(1024);
        next[0] = 0x03;
        vm.prank(address(account));
        account.rotateKey(next);
        assertEq(account.isValidSignature(digest, sig), bytes4(0xffffffff), "old key no longer verifies");
    }

    function test_rotateKeyRejectsWrongLength() public {
        vm.prank(address(account));
        vm.expectRevert(abi.encodeWithSelector(QPayAccount.BadKeyLength.selector, 5));
        account.rotateKey(new bytes(5));
    }
}
