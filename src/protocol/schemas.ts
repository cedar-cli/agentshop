import { z } from "zod";

const decisionWeightsSchema = z
  .object({
    price: z.number().min(0).max(1),
    reputation: z.number().min(0).max(1),
    delivery: z.number().min(0).max(1),
  })
  .refine(
    ({ price, reputation, delivery }) =>
      Math.abs(price + reputation + delivery - 1) < 0.0001,
    "Decision weights must add up to 1",
  );

export const purchaseRequestSchema = z.object({
  product: z.string().min(1),
  quantity: z.number().int().positive(),
  budget: z.number().positive(),
  deadline: z.iso.datetime({ offset: true }),
  constraints: z.object({
    allergenFree: z.array(z.string()),
  }),
  weights: decisionWeightsSchema,
});

export const proposalSchema = z.object({
  sellerId: z.string().min(1),
  totalPrice: z.number().positive(),
  deliveryHours: z.number().positive(),
  reputation: z.number().min(0).max(100),
  allergenSafe: z.boolean(),
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const sellerSelectionSchema = z.object({
  sellerId: z.string().min(1),
  score: z.number(),
  reason: z.string().min(1),
  proposal: proposalSchema,
});

// 买家还价请求：目标价必须为正，理由用于 demo 展示谈判话术
const counterOfferSchema = z.object({
  sellerId: z.string().min(1),
  originalPrice: z.number().positive(),
  targetPrice: z.number().positive(),
  reasoning: z.string().min(1).max(240),
});

// 商家还价应答：让利金额不得为负，最终价必须为正
const counterResponseSchema = z.object({
  sellerId: z.string().min(1),
  accepted: z.boolean(),
  finalPrice: z.number().positive(),
  concession: z.number().min(0),
  reasoning: z.string().min(1).max(240),
  generatedBy: z.enum(["llm", "fallback"]),
  fallbackReason: z.string().max(240).optional(),
});

const confirmedOrderSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  totalPrice: z.number().positive(),
  status: z.literal("confirmed"),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("purchase.requested"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: purchaseRequestSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("proposal.submitted"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: proposalSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("seller.selected"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: sellerSelectionSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("counter.offer"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: counterOfferSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("counter.response"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: counterResponseSchema,
  }),
  z.object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    type: z.literal("order.confirmed"),
    source: z.string().min(1),
    target: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }),
    causationId: z.string().optional(),
    payload: confirmedOrderSchema,
  }),
]);
