/**
 * 第四幕 · Live Receipt（实时电子回执）
 *
 * 只在真实 receipt.issued 事件到达后渲染，绝不提前出现。展示：
 * Buyer Agent authorized、Seller、金额、Auto-approved、交期、transactionId、
 * receiptId、evidenceSnapshotHash 缩略、Hash Chain Verified。
 */

import { BadgeCheck, Link2, Receipt, ShieldCheck } from "lucide-react";
import type { LiveReceipt, NewbornEvent } from "../types";
import { SELLER_FALLBACK_NAME, sellerRole, shortHash, usd } from "./format";

interface LiveReceiptCardProps {
  // 回执 payload（未签发则不渲染）
  receipt: LiveReceipt | undefined;
  // 卖家展示名映射
  sellerNames: Record<string, string>;
  // 交易 id
  transactionId: string | undefined;
  // 哈希链是否校验通过（来自快照）
  chainValid: boolean | undefined;
}

/**
 * 实时回执卡。
 * @param receipt 回执数据
 * @param sellerNames 卖家展示名
 * @param transactionId 交易 id
 * @param chainValid 哈希链校验结果
 */
export function LiveReceiptCard({
  receipt,
  sellerNames,
  transactionId,
  chainValid,
}: LiveReceiptCardProps) {
  if (!receipt) {
    return (
      <div className="receipt receipt--empty">
        <Receipt size={20} />
        <span>回执将在成交授权后签发</span>
      </div>
    );
  }

  const name =
    sellerNames[receipt.sellerId] ?? SELLER_FALLBACK_NAME[receipt.sellerId];

  return (
    <div className={`receipt role-${sellerRole(receipt.sellerId)}`}>
      <div className="receipt__head">
        <Receipt size={15} />
        <strong>Live Receipt</strong>
        <span className="tag tag--auto">Auto-approved</span>
      </div>

      <p className="receipt__line">
        <BadgeCheck size={13} className="ic ic--green" />
        Buyer Agent authorized purchase
      </p>

      <dl className="receipt__grid">
        <div>
          <dt>Seller</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className="receipt__amount">{usd(receipt.amountUsd)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{receipt.deliveryHours}h</dd>
        </div>
        <div>
          <dt>Receipt ID</dt>
          <dd className="mono">{receipt.receiptId}</dd>
        </div>
        <div className="receipt__grid-wide">
          <dt>
            <Link2 size={11} /> Transaction
          </dt>
          <dd className="mono">{transactionId ?? "—"}</dd>
        </div>
        <div className="receipt__grid-wide">
          <dt>Evidence Snapshot</dt>
          <dd className="mono">{shortHash(receipt.evidenceSnapshotHash, 18)}</dd>
        </div>
      </dl>

      <div className={`receipt__chain ${chainValid === false ? "bad" : "ok"}`}>
        <ShieldCheck size={14} />
        {chainValid === false
          ? "Hash Chain Invalid"
          : chainValid === true
            ? "Hash Chain Verified"
            : "Verifying Hash Chain…"}
      </div>
    </div>
  );
}
