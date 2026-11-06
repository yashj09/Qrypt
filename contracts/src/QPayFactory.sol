// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {QPayAccount, ISigVerifier, IStakingRegistry} from "./QPayAccount.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// Creates a Q-Pay account for a Falcon public key: deploys it, stakes it from this factory's balance, and mints test
/// USDC to it. Called by the onboarding service, so judges get a working post-quantum account without holding ETH.
contract QPayFactory {
    ISigVerifier public immutable verifier;
    IStakingRegistry public immutable registry;
    MockUSDC public immutable usdc;
    address public immutable operator;
    uint256 public immutable stakePerAccount;
    uint256 public immutable usdcPerAccount;

    /// One account per Falcon key, so a retried onboarding request returns the same account.
    mapping(bytes32 => address) public accountOf;

    event AccountCreated(address indexed account, bytes32 indexed pubkeyHash);

    error NotOperator();
    error BadPubkeyLength(uint256 length);

    constructor(
        ISigVerifier verifier_,
        IStakingRegistry registry_,
        MockUSDC usdc_,
        uint256 stakePerAccount_,
        uint256 usdcPerAccount_
    ) payable {
        verifier = verifier_;
        registry = registry_;
        usdc = usdc_;
        operator = msg.sender;
        stakePerAccount = stakePerAccount_;
        usdcPerAccount = usdcPerAccount_;
    }

    function create(bytes calldata nttPubkey) external returns (address account) {
        if (msg.sender != operator) revert NotOperator();
        if (nttPubkey.length != 1024) revert BadPubkeyLength(nttPubkey.length);
        bytes32 key = keccak256(nttPubkey);
        account = accountOf[key];
        if (account != address(0)) return account;
        account = address(new QPayAccount{value: stakePerAccount}(verifier, nttPubkey, registry, 0));
        accountOf[key] = account;
        usdc.mint(account, usdcPerAccount);
        emit AccountCreated(account, key);
    }

    receive() external payable {}
}
