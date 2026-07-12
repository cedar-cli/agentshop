import type { AgentHandler } from "./types.js";
import type {
  AgentEvent,
  NewAgentEvent,
  PurchaseRequest,
} from "../protocol/events.js";
import {
  createFallbackProposal,
  type ProposalGenerator,
  validateGeneratedProposal,
} from "./proposal-generator.js";
import {
  createFallbackDecision,
  type CounterNegotiator,
  validateNegotiationDecision,
} from "./counter-negotiator.js";
import type { SellerProfile } from "./seller-profiles.js";

class FallbackProposalGenerator implements ProposalGenerator {
  async generate(
    profile: SellerProfile,
    request: AgentEvent<"purchase.requested">["payload"],
  ) {
    return createFallbackProposal(profile, request);
  }
}

class FallbackCounterNegotiator implements CounterNegotiator {
  async negotiate(
    profile: SellerProfile,
    request: PurchaseRequest,
    offer: AgentEvent<"counter.offer">["payload"],
  ) {
    return createFallbackDecision(profile, request, offer);
  }
}

export class SellerAgent implements AgentHandler {
  readonly id: string;

  // 记录本卖家在各交易中的原始报价与对应采购需求，供后续砍价环节换算成本底线与让步幅度
  private readonly quotes = new Map<
    string,
    { request: PurchaseRequest; totalPrice: number }
  >();

  constructor(
    private readonly profile: SellerProfile,
    private readonly generator: ProposalGenerator = new FallbackProposalGenerator(),
    private readonly negotiator: CounterNegotiator = new FallbackCounterNegotiator(),
  ) {
    this.id = profile.sellerId;
  }

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type === "counter.offer") {
      return this.handleCounterOffer(event);
    }

    if (event.type !== "purchase.requested") return [];

    let generatedBy: "llm" | "fallback" = "llm";
    let generated;
    let fallbackReason: string | undefined;

    try {
      generated = validateGeneratedProposal(
        await this.generator.generate(this.profile, event.payload),
        this.profile,
        event.payload,
      );
    } catch (error) {
      generatedBy = "fallback";
      fallbackReason =
        error instanceof Error ? error.message.slice(0, 240) : String(error);
      generated = createFallbackProposal(this.profile, event.payload);
    }

    // 记住本次报价与对应需求，后续若被买家还价，需要据此换算成本底线与让步幅度
    this.quotes.set(event.transactionId, {
      request: event.payload,
      totalPrice: generated.totalPrice,
    });

    return [
      {
        transactionId: event.transactionId,
        type: "proposal.submitted",
        source: this.id,
        target: event.source,
        payload: {
          sellerId: this.profile.sellerId,
          totalPrice: generated.totalPrice,
          deliveryHours: generated.deliveryHours,
          reputation: this.profile.reputation,
          allergenSafe: this.profile.allergenSafe,
          reasoning: generated.reasoning,
          generatedBy,
          fallbackReason,
        },
      },
    ];
  }

  /**
   * 处理买家的一轮还价。
   * 只有被点名的赢家（offer.sellerId === 本卖家）才应答；其余卖家忽略。
   * 用 LLM 决定让步幅度与话术，超时或返回非法（跌破成本底线/借机涨价）时降级到规则兜底。
   */
  private async handleCounterOffer(
    event: AgentEvent<"counter.offer">,
  ): Promise<NewAgentEvent[]> {
    const offer = event.payload;
    if (offer.sellerId !== this.id) return [];

    // 取回本卖家在该交易中的原始报价与采购需求；理论上必然存在（先报价才会被还价）
    const quote = this.quotes.get(event.transactionId);
    const request = quote?.request;
    if (!request) {
      throw new Error(
        `${this.id} received a counter offer without a prior quote`,
      );
    }

    let generatedBy: "llm" | "fallback" = "llm";
    let decision;
    let fallbackReason: string | undefined;

    try {
      decision = validateNegotiationDecision(
        await this.negotiator.negotiate(this.profile, request, offer),
        this.profile,
        request,
        offer,
      );
    } catch (error) {
      generatedBy = "fallback";
      fallbackReason =
        error instanceof Error ? error.message.slice(0, 240) : String(error);
      decision = createFallbackDecision(this.profile, request, offer);
    }

    // 让利金额 = 原价 - 最终价，钳到非负避免浮点误差产生负值
    const concession = Number(
      Math.max(0, offer.originalPrice - decision.finalPrice).toFixed(2),
    );

    return [
      {
        transactionId: event.transactionId,
        type: "counter.response",
        source: this.id,
        target: event.source,
        payload: {
          sellerId: this.id,
          accepted: concession > 0,
          finalPrice: decision.finalPrice,
          concession,
          reasoning: decision.reasoning,
          generatedBy,
          fallbackReason,
        },
      },
    ];
  }
}
