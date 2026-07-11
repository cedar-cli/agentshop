/**
 * 证据清单（Evidence Checklist）· 第三幕右侧
 *
 * 展示聚焦卖家（默认 Seller C）在 evidence.submitted 中真实提交的结构化凭证：
 * type / issuer / referenceId / verificationStatus / validUntil / contentHash 缩略，
 * 并明确标注「Demo Credential」与 disclaimer，绝不伪装成真实外部认证。
 */

import { FileCheck2, ShieldCheck, ShieldX } from "lucide-react";
import { evidenceSubmission } from "../demo-state";
import type { EvidenceDocument, NewbornEvent } from "../types";
import {
  EVIDENCE_KIND_LABEL,
  SELLER_FALLBACK_NAME,
  shortHash,
} from "./format";

interface EvidenceChecklistProps {
  // 已到达事件
  events: NewbornEvent[];
  // 卖家展示名映射
  sellerNames: Record<string, string>;
  // 聚焦卖家（默认 seller-c）
  focusSellerId?: string;
}

/**
 * 证据清单组件。
 * @param events 已到达事件
 * @param sellerNames 卖家展示名
 * @param focusSellerId 聚焦卖家
 */
export function EvidenceChecklist({
  events,
  sellerNames,
  focusSellerId = "seller-c",
}: EvidenceChecklistProps) {
  const submission = evidenceSubmission(events, focusSellerId);
  const name = sellerNames[focusSellerId] ?? SELLER_FALLBACK_NAME[focusSellerId];

  if (!submission) {
    return (
      <div className="evidence evidence--empty">
        <FileCheck2 size={22} />
        <span>{name} 尚未提交证据</span>
      </div>
    );
  }

  // 仅展示带结构化凭证的文档（凭证要素齐全）
  const withCredential = submission.documents.filter(
    (document) => document.credential !== undefined,
  );
  // 取任一凭证的 disclaimer 作为统一免责说明
  const disclaimer = withCredential[0]?.credential?.disclaimer;

  return (
    <div className="evidence">
      <div className="evidence__list">
        {withCredential.map((document) => (
          <EvidenceItem key={document.requirementId} document={document} />
        ))}
      </div>

      {disclaimer && (
        <p className="evidence__disclaimer">
          <ShieldCheck size={12} />
          {disclaimer}
        </p>
      )}
    </div>
  );
}

/** 单条证据凭证卡。 */
function EvidenceItem({ document }: { document: EvidenceDocument }) {
  const credential = document.credential;
  if (!credential) return null;

  const verifiable = credential.verificationStatus === "demo-verifiable";

  return (
    <div className={`evidence-item ${verifiable ? "ok" : "bad"}`}>
      <div className="evidence-item__head">
        <span className="evidence-item__type">
          {EVIDENCE_KIND_LABEL[credential.type]}
        </span>
        <span className="tag tag--demo">Demo Credential</span>
      </div>

      <dl className="evidence-item__fields">
        <div>
          <dt>签发方</dt>
          <dd>{credential.issuer}</dd>
        </div>
        <div>
          <dt>Ref</dt>
          <dd className="mono">{credential.referenceId}</dd>
        </div>
        <div>
          <dt>有效至</dt>
          <dd>{credential.validUntil.slice(0, 10)}</dd>
        </div>
        <div>
          <dt>Hash</dt>
          <dd className="mono">{shortHash(credential.hash, 12)}</dd>
        </div>
      </dl>

      <div className="evidence-item__status">
        {verifiable ? (
          <>
            <ShieldCheck size={13} className="ic ic--green" />
            <span>demo-verifiable</span>
          </>
        ) : (
          <>
            <ShieldX size={13} className="ic ic--orange" />
            <span>unverifiable</span>
          </>
        )}
      </div>
    </div>
  );
}
