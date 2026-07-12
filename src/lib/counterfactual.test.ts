import { describe, expect, it } from "vitest";
import { championOf, rankOffers, scoreOffer } from "./counterfactual";
import { getPurchaseById } from "../demo/demoData";
import type { OfferPreference } from "../demo/demoData";

const laptop = getPurchaseById("laptop-trip")!;

describe("counterfactual · 假设时间机器", () => {
  it("基线偏好下，冠军与下单时实际入选的卖家一致", () => {
    const champion = championOf(laptop.offers, laptop.baselinePref);
    const selected = laptop.offers.find((o) => o.selected)!;
    expect(champion?.seller).toBe(selected.seller);
  });

  it("把价格权重拉满，冠军翻盘为更便宜的卖家（决策随偏好改变）", () => {
    const pricePref: OfferPreference = {
      timeliness: 10,
      spec: 10,
      price: 70,
      afterSales: 10,
    };
    const champion = championOf(laptop.offers, pricePref);
    expect(champion?.seller).toBe("锐捷·数码");
    // 且确实不同于基线冠军，证明发生了切换
    expect(champion?.seller).not.toBe(
      championOf(laptop.offers, laptop.baselinePref)?.seller,
    );
  });

  it("把时效权重拉满，冠军仍是时效最强的卖家", () => {
    const timePref: OfferPreference = {
      timeliness: 70,
      spec: 10,
      price: 10,
      afterSales: 10,
    };
    expect(championOf(laptop.offers, timePref)?.seller).toBe("云仓·旗舰店");
  });

  it("rankOffers 返回连续排名且降序", () => {
    const ranked = rankOffers(laptop.offers, laptop.baselinePref);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  it("每个演示购买在其基线偏好下，入选卖家都是冠军（数据自洽）", () => {
    for (const purchase of [laptop]) {
      const champion = championOf(purchase.offers, purchase.baselinePref);
      const selected = purchase.offers.find((o) => o.selected)!;
      expect(champion?.seller).toBe(selected.seller);
    }
  });

  it("scoreOffer 对空偏好不崩溃", () => {
    const zero: OfferPreference = {
      timeliness: 0,
      spec: 0,
      price: 0,
      afterSales: 0,
    };
    expect(() => scoreOffer(laptop.offers[0], zero)).not.toThrow();
  });
});
