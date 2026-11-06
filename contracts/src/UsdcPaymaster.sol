// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {Scope, TxParam, FrameParam, FrameMode} from "@forshtat/hegota-support/contracts/Params.sol";

interface IERC20Balance {
    function balanceOf(address holder) external view returns (uint256);
}

interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
}

/// Pays gas in ETH for any sender that repays it in USDC inside the same transaction. No off-chain signer, no
/// relayer: the rule is enforced by introspecting the transaction's frames.
///
/// Expected layout: the payer VERIFY frame sits right after the sender's VERIFY frame, and the frame right after the
/// payer frame is a SENDER frame calling `usdc.transfer(address(this), fee)` with `fee >= quote(maxCost)`.
/// The price is an immutable, so validation reads no storage of this contract. The only foreign storage read is the
/// sender's USDC balance, a slot associated with the sender.
contract UsdcPaymaster is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    bytes4 internal constant TRANSFER = 0xa9059cbb;

    IERC20Balance public immutable usdc;
    /// USDC base units (6 decimals) charged per 1 ETH of maximum transaction cost.
    uint256 public immutable usdcPerEth;
    address public immutable owner;

    error NotRepayFrame();
    error FeeTooLow(uint256 fee, uint256 quote);
    error InsufficientUsdc(uint256 balance, uint256 fee);
    error NotOwner();

    constructor(IERC20Balance usdc_, uint256 usdcPerEth_) payable {
        usdc = usdc_;
        usdcPerEth = usdcPerEth_;
        owner = msg.sender;
    }

    /// The payer VERIFY frame lands here.
    fallback() external {
        uint256 repayFrame = txparam(TxParam.CURRENT_FRAME_INDEX) + 1;
        if (repayFrame >= txparam(TxParam.FRAME_COUNT)) revert NotRepayFrame();
        if (frameparam(repayFrame, FrameParam.MODE) != uint256(FrameMode.SENDER)) revert NotRepayFrame();
        if (frameparam(repayFrame, FrameParam.RESOLVED_TARGET) != uint256(uint160(address(usdc)))) {
            revert NotRepayFrame();
        }
        if (bytes4(framedataload(0, repayFrame)) != TRANSFER) revert NotRepayFrame();
        if (address(uint160(uint256(framedataload(4, repayFrame)))) != address(this)) revert NotRepayFrame();

        uint256 fee = uint256(framedataload(36, repayFrame));
        uint256 owed = quote(txparam(TxParam.MAX_COST));
        if (fee < owed) revert FeeTooLow(fee, owed);

        address sender = address(uint160(txparam(TxParam.SENDER)));
        uint256 balance = usdc.balanceOf(sender);
        if (balance < fee) revert InsufficientUsdc(balance, fee);

        approve(Scope.PAYMENT);
    }

    function quote(uint256 maxCostWei) public view returns (uint256) {
        return (maxCostWei * usdcPerEth + 1e18 - 1) / 1e18;
    }

    function deposit() external payable {}

    function stake(IStakingRegistry registry, uint32 unstakeDelay) external payable {
        if (msg.sender != owner) revert NotOwner();
        registry.addStake{value: msg.value}(unstakeDelay);
    }

    function withdraw(address payable to, uint256 ethAmount, uint256 usdcAmount) external {
        if (msg.sender != owner) revert NotOwner();
        if (usdcAmount > 0) {
            (bool okToken,) = address(usdc).call(abi.encodeWithSelector(TRANSFER, to, usdcAmount));
            require(okToken, "usdc transfer failed");
        }
        if (ethAmount > 0) {
            (bool okEth,) = to.call{value: ethAmount}("");
            require(okEth, "eth transfer failed");
        }
    }
}
