import type { ActiveSalesConsent } from "../protocol/events.js";

export interface ActiveSalesProductFact {
  id: string;
  name: string;
  category: string;
  priceUsd: number;
  stock: number;
  rawDescription: string;
  facts: string[];
}

export interface ActiveSalesBuyerFact {
  id: string;
  displayName: string;
  profile: string;
  consent: ActiveSalesConsent;
  exposedFields: string[];
}

export interface ProductPassportDraft {
  features: string[];
  summary: string;
  passport: {
    material: string;
    evidence: string;
    delivery: string;
    returns: string;
  };
}

export interface ActiveSalesLlmAgent {
  buildPassport(product: ActiveSalesProductFact): Promise<ProductPassportDraft>;
  writeProposal(
    product: ActiveSalesProductFact,
    buyer: ActiveSalesBuyerFact,
    passport: ProductPassportDraft,
  ): Promise<string>;
}

export function fallbackPassport(product: ActiveSalesProductFact): ProductPassportDraft {
  return {
    features: [
      "TENCEL Lyocell 68%",
      "OEKO-TEX 演示凭证可验",
      "60°C 可机洗",
      "新生儿敏感肌场景",
      "72 小时配送 SLA",
      "30 天机器可读退货",
      "无香料整理",
      `${product.stock.toLocaleString("en-US")} 套现货`,
    ],
    summary: "低敏婴儿床品套装，材料、认证、履约与退货政策已转为 Buyer Agent 可验证字段。",
    passport: {
      material: "TENCEL Lyocell 68%",
      evidence: "OEKO-TEX DEMO-NB-401",
      delivery: "72h · 历史履约置信度 96.8%",
      returns: "30 天可退 · 机器可读规则",
    },
  };
}

export function fallbackProposal(
  product: ActiveSalesProductFact,
  buyer: ActiveSalesBuyerFact,
): string {
  if (buyer.id === "mia") {
    return `${product.name} 提供可验证低敏材料、72 小时送达与 30 天退货，$${product.priceUsd} 在你的 $180 授权预算内。`;
  }
  return `${product.name} 可提供批量条款、可执行配送 SLA 与材料凭证；本提案仅使用已授权的匿名品类、数量和预算带。`;
}
