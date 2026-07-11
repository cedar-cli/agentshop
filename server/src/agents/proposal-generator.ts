import type { PurchaseRequest } from "../protocol/events.js";
import type { SellerProfile } from "./seller-profiles.js";

export interface GeneratedProposal {
  totalPrice: number;
  deliveryHours: number;
  reasoning: string;
}

export interface ProposalGenerator {
  generate(
    profile: SellerProfile,
    request: PurchaseRequest,
  ): Promise<GeneratedProposal>;
}

export function minimumAllowedPrice(
  profile: SellerProfile,
  request: PurchaseRequest,
): number {
  return Number(
    (
      profile.unitCost *
      request.quantity *
      (1 + profile.minimumMargin)
    ).toFixed(2),
  );
}

export function createFallbackProposal(
  profile: SellerProfile,
  request: PurchaseRequest,
): GeneratedProposal {
  const minimumPrice = minimumAllowedPrice(profile, request);
  const strategyMultiplier =
    profile.minimumDeliveryHours <= 4
      ? 1.04
      : profile.reputation >= 90
        ? 1.04
        : 1.02;

  let totalPrice = minimumPrice * strategyMultiplier;
  if (minimumPrice <= request.budget) {
    totalPrice = Math.min(totalPrice, request.budget);
  }

  return {
    totalPrice: Number(totalPrice.toFixed(2)),
    deliveryHours: profile.minimumDeliveryHours,
    reasoning: "模型不可用，按成本、最低利润率与经营策略生成兜底报价",
  };
}

export function validateGeneratedProposal(
  proposal: GeneratedProposal,
  profile: SellerProfile,
  request: PurchaseRequest,
): GeneratedProposal {
  if (profile.inventory < request.quantity) {
    throw new Error(`${profile.sellerId} inventory is insufficient`);
  }

  const minimumPrice = minimumAllowedPrice(profile, request);
  if (proposal.totalPrice < minimumPrice) {
    throw new Error(`${profile.sellerId} proposal is below its cost floor`);
  }

  if (minimumPrice <= request.budget && proposal.totalPrice > request.budget) {
    throw new Error(`${profile.sellerId} ignored the buyer budget`);
  }

  if (proposal.deliveryHours < profile.minimumDeliveryHours) {
    throw new Error(`${profile.sellerId} promised an impossible delivery time`);
  }

  return {
    totalPrice: Number(proposal.totalPrice.toFixed(2)),
    deliveryHours: Number(proposal.deliveryHours.toFixed(1)),
    reasoning: proposal.reasoning.trim().slice(0, 240),
  };
}
