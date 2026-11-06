// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {UsdcPaymaster, IERC20Balance} from "../src/UsdcPaymaster.sol";
import {QPayAccount, ISigVerifier, IStakingRegistry} from "../src/QPayAccount.sol";

/// Deploys the Q-Pay contracts against an already deployed Falcon verifier.
///
/// env: VERIFIER, FALCON_PUBKEY (1024-byte hex), STAKING_REGISTRY, USDC_PER_ETH (default 3000e6),
///      ACCOUNT_STAKE_WEI (default 0.012 ether), PAYMASTER_ETH_WEI (default 1 ether), USDC_MINT (default 100e6)
contract Deploy is Script {
    function run() external {
        ISigVerifier verifier = ISigVerifier(vm.envAddress("VERIFIER"));
        bytes memory pubkey = vm.envBytes("FALCON_PUBKEY");
        IStakingRegistry registry = IStakingRegistry(vm.envOr("STAKING_REGISTRY", address(0)));
        uint256 usdcPerEth = vm.envOr("USDC_PER_ETH", uint256(3000e6));
        uint256 accountStake = vm.envOr("ACCOUNT_STAKE_WEI", uint256(0.012 ether));
        uint256 paymasterEth = vm.envOr("PAYMASTER_ETH_WEI", uint256(1 ether));
        uint256 usdcMint = vm.envOr("USDC_MINT", uint256(100e6));

        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC();
        UsdcPaymaster paymaster = new UsdcPaymaster{value: paymasterEth}(IERC20Balance(address(usdc)), usdcPerEth);
        QPayAccount account = new QPayAccount{value: address(registry) == address(0) ? 0 : accountStake}(
            verifier, pubkey, registry, 0
        );
        usdc.mint(address(account), usdcMint);
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeAddress(json, "verifier", address(verifier));
        vm.serializeAddress(json, "usdc", address(usdc));
        vm.serializeAddress(json, "paymaster", address(paymaster));
        vm.serializeUint(json, "usdcPerEth", usdcPerEth);
        vm.serializeUint(json, "chainId", block.chainid);
        string memory out = vm.serializeAddress(json, "account", address(account));
        vm.writeJson(out, string.concat("../deployments/", vm.toString(block.chainid), ".json"));
        console.log("account", address(account));
        console.log("paymaster", address(paymaster));
        console.log("usdc", address(usdc));
    }
}
