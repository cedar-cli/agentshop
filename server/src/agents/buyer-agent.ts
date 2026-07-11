import { randomUUID } from "node:crypto";
import type { AgentHandler } from "./types.js";
import type {
  AgentEvent,
  NewAgentEvent,
  Proposal,
  PurchaseRequest,
} from "../protocol/events.js";

interface TransactionState {
  request?: PurchaseRequest;
  proposals: Proposal[];
  // 选标后记住赢家提案，收到商家还价应答时据此确认订单
  winner?: Proposal;
}

export class BuyerAgent implements AgentHandler {
  readonly id = "buyer-agent";
  private readonly transactions = new Map<string, TransactionState>();

  constructor(private readonly expectedProposalCount: number) {}

  async handle(event: AgentEvent): Promise<NewAgentEvent[]> {
    if (event.type === "purchase.requested") {
      this.transactions.set(event.transactionId, {
        request: event.payload,
        proposals: [],
      });
      return [];
    }

    if (event.type === "proposal.submitted") {
      return this.handleProposal(event);
    }

    if (event.type === "seller.selected") {
      return this.handleSellerSelected(event);
    }

    if (event.type === "counter.response") {
      return this.handleCounterResponse(event);
    }

    return [];
  }

  /**
   * 选出赢家后，不直接下单，而是先向赢家发起一轮还价。
   * 目标价：在赢家报价与市场次低价之间取更低的锚点再压 5%，但不低于赢家报价的 88%，
   * 让谈判既有诚意又不离谱；同时把赢家提案记入 state，等商家应答后再确认。
   */
  private handleSellerSelected(
    event: AgentEvent<"seller.selected">,
  ): NewAgentEvent[] {
    const state = this.transactions.get(event.transactionId);
    if (!state?.request) {
      throw new Error(`Unknown transaction: ${event.transactionId}`);
    }

    const winner = event.payload.proposal;
    state.winner = winner;

    // 市场次低价：其余合格提案里的最低价，作为买家还价的市场参照锚点
    const others = state.proposals
      .filter((proposal) => proposal.sellerId !== winner.sellerId)
      .map((proposal) => proposal.totalPrice);
    const marketAnchor =
      others.length > 0 ? Math.min(...others) : winner.totalPrice;

    // 取赢家价与市场锚点中更低者再压 5%，并设 88% 的地板价，避免目标价过于离谱
    const rawTarget = Math.min(winner.totalPrice, marketAnchor) * 0.95;
    const floor = winner.totalPrice * 0.88;
    const targetPrice = Number(Math.max(rawTarget, floor).toFixed(2));

    return [
      {
        transactionId: event.transactionId,
        type: "counter.offer",
        source: this.id,
        target: winner.sellerId,
        payload: {
          sellerId: winner.sellerId,
          originalPrice: winner.totalPrice,
          targetPrice,
          reasoning: "已对比全部报价，希望在市场最优价基础上进一步让利以促成交",
        },
      },
    ];
  }

  /**
   * 收到商家对还价的应答后，按最终成交价确认订单。
   * 无论商家是否让步，本轮谈判后都会以 finalPrice 成交（单轮砍价，不再往返）。
   */
  private handleCounterResponse(
    event: AgentEvent<"counter.response">,
  ): NewAgentEvent[] {
    const state = this.transactions.get(event.transactionId);
    if (!state?.winner) {
      throw new Error(
        `Counter response for unknown or unselected transaction: ${event.transactionId}`,
      );
    }

    return [
      {
        transactionId: event.transactionId,
        type: "order.confirmed",
        source: this.id,
        target: event.payload.sellerId,
        payload: {
          orderId: `order-${randomUUID()}`,
          sellerId: event.payload.sellerId,
          totalPrice: event.payload.finalPrice,
          status: "confirmed",
        },
      },
    ];
  }

  private handleProposal(
    event: AgentEvent<"proposal.submitted">,
  ): NewAgentEvent[] {
    const state = this.transactions.get(event.transactionId);
    if (!state?.request) {
      throw new Error(`Unknown transaction: ${event.transactionId}`);
    }

    state.proposals.push(event.payload);
    if (state.proposals.length < this.expectedProposalCount) return [];

    const eligible = state.proposals.filter(
      (proposal) =>
        proposal.totalPrice <= state.request!.budget && proposal.allergenSafe,
    );

    if (eligible.length === 0) {
      throw new Error("No proposal satisfies the hard constraints");
    }

    const minPrice = Math.min(...eligible.map((item) => item.totalPrice));
    const minDelivery = Math.min(...eligible.map((item) => item.deliveryHours));
    const weights = state.request.weights;

    const ranked = eligible
      .map((proposal) => {
        const priceScore = (minPrice / proposal.totalPrice) * 100;
        const deliveryScore = (minDelivery / proposal.deliveryHours) * 100;
        const score =
          priceScore * weights.price +
          proposal.reputation * weights.reputation +
          deliveryScore * weights.delivery;

        return { proposal, score };
      })
      .sort((left, right) => right.score - left.score);

    const winner = ranked[0];
    if (!winner) throw new Error("Unable to rank proposals");

    return [
      {
        transactionId: event.transactionId,
        type: "seller.selected",
        source: this.id,
        target: winner.proposal.sellerId,
        payload: {
          sellerId: winner.proposal.sellerId,
          score: Number(winner.score.toFixed(2)),
          reason: "满足全部硬约束，并取得最高综合评分",
          proposal: winner.proposal,
        },
      },
    ];
  }
}
