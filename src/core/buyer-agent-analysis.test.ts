import { describe, expect, it } from "vitest";
import { PERSONAS } from "./evolution";
import {
  analyzeBuyerAgents,
  buildCatalog,
  type SellerSeed,
} from "./buyer-agent-analysis";
import type { Category } from "./types";

const CAT: Category = "3C数码";

const sellers: SellerSeed[] = [
  { id: "S1", name: "优等生", category: CAT, credit: 86 },
  { id: "S2", name: "夸大党", category: CAT, credit: 74 },
  { id: "S3", name: "慢郎中", category: CAT, credit: 72 },
  { id: "S4", name: "甩手掌柜", category: CAT, credit: 70 },
  { id: "S5", name: "价格高", category: CAT, credit: 66 },
  { id: "SF", name: "已沉底", category: CAT, credit: 20, flagged: true },
  { id: "X1", name: "别的品类", category: "生鲜" as Category, credit: 95 },
];

describe("buyer-agent-analysis · 意图 × 商品的推荐/决策漏斗", () => {
  it("buildCatalog：只取本品类未沉底卖家，每家固定商品数，正确标注我方", () => {
    const catalog = buildCatalog(sellers, "S2", CAT, 42);
    // 5 家有效卖家（排除 flagged 与别的品类）× 3 商品
    expect(catalog).toHaveLength(15);
    expect(catalog.every((p) => p.category === CAT)).toBe(true);
    expect(catalog.some((p) => p.sellerId === "SF")).toBe(false);
    expect(catalog.filter((p) => p.isMine).every((p) => p.sellerId === "S2")).toBe(
      true,
    );
    expect(catalog.filter((p) => p.isMine)).toHaveLength(3);
  });

  it("确定性：同 seed 分析结果完全一致", () => {
    const a = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    const b = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("率都落在 [0,1]，且 推荐率 ≥ 综合胜出率（胜出必先入选）", () => {
    const res = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    for (const board of res.intentBoards) {
      for (const row of board.rows) {
        for (const v of [row.recommendRate, row.decideRate, row.winRate]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(row.recommendRate + 1e-9).toBeGreaterThanOrEqual(row.winRate);
      }
    }
  });

  it("一系列意图榜：每意图一张，名次连续，按胜出率降序", () => {
    const res = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    expect(res.intentBoards).toHaveLength(PERSONAS.length);
    for (const board of res.intentBoards) {
      expect(board.rows).toHaveLength(res.productCount);
      expect(board.rows.map((r) => r.rank)).toEqual(
        board.rows.map((_, i) => i + 1),
      );
      for (let i = 1; i < board.rows.length; i++) {
        expect(board.rows[i - 1].winRate + 1e-9).toBeGreaterThanOrEqual(
          board.rows[i].winRate,
        );
      }
    }
    // 「多个意图榜」的价值：至少两张榜的榜首商品不同
    const leaders = res.intentBoards.map((b) => b.rows[0].productId);
    expect(new Set(leaders).size).toBeGreaterThan(1);
  });

  it("每个商品都有自己的意图榜：覆盖全部意图，名次在 1..total 内", () => {
    const res = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    expect(res.productProfiles).toHaveLength(res.productCount);
    for (const prof of res.productProfiles) {
      expect(prof.standings).toHaveLength(PERSONAS.length);
      const personaIds = new Set(prof.standings.map((s) => s.personaId));
      expect(personaIds.size).toBe(PERSONAS.length);
      for (const s of prof.standings) {
        expect(s.rank).toBeGreaterThanOrEqual(1);
        expect(s.rank).toBeLessThanOrEqual(res.productCount);
      }
      // 站位按名次升序
      for (let i = 1; i < prof.standings.length; i++) {
        expect(prof.standings[i - 1].rank).toBeLessThanOrEqual(
          prof.standings[i].rank,
        );
      }
    }
  });

  it("推荐率与决策率承载不同信号：至少一个意图下二者的冠军商品不同", () => {
    const res = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    let diverged = false;
    for (const board of res.intentBoards) {
      const topRecommend = board.rows
        .slice()
        .sort((a, b) => b.recommendRate - a.recommendRate)[0];
      const topDecide = board.rows
        .slice()
        .filter((r) => r.recommendRate > 0)
        .sort((a, b) => b.decideRate - a.decideRate)[0];
      if (topRecommend && topDecide && topRecommend.productId !== topDecide.productId) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });

  it("我方汇总：率合法，且给出最强/最弱意图", () => {
    const res = analyzeBuyerAgents(sellers, "S2", CAT, 42);
    expect(res.mySummary.products).toBe(3);
    expect(res.mySummary.avgRecommendRate).toBeGreaterThanOrEqual(0);
    expect(res.mySummary.avgRecommendRate).toBeLessThanOrEqual(1);
    expect(res.mySummary.bestIntentLabel).not.toBeNull();
    expect(res.mySummary.worstIntentLabel).not.toBeNull();
  });

  it("边界：品类无有效卖家时安全返回空结果", () => {
    const res = analyzeBuyerAgents([], "S2", CAT, 42);
    expect(res.productCount).toBe(0);
    expect(res.productProfiles).toHaveLength(0);
    for (const board of res.intentBoards) expect(board.rows).toHaveLength(0);
    expect(res.mySummary.products).toBe(0);
  });
});
