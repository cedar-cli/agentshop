import { useMemo, useState } from "react";
import { useWorld } from "../../core/store";
import { activeLinks, categoryRanking, sellersOf } from "../../core/selectors";
import type { Agent } from "../../core/types";
import { TopologyCanvas } from "../topology/TopologyCanvas";

export function MerchantTopology({ seller }: { seller: Agent }) {
  const agents = useWorld((s) => s.agents);
  const transactions = useWorld((s) => s.transactions);
  const [mode, setMode] = useState<"downstream" | "upstream">("downstream");

  const { nodes, links } = useMemo(() => {
    const all = activeLinks(transactions);
    if (mode === "upstream") {
      const upstream = Object.values(agents).filter(
        (a) =>
          a.role === "supply" || a.role === "factory" || a.id === seller.id,
      );
      const ids = new Set(upstream.map((a) => a.id));
      return {
        nodes: upstream,
        links: all.filter(
          (l) => l.upstream && (ids.has(l.from) || ids.has(l.to)),
        ),
      };
    }
    // 下游获客：同品类卖家 + 该品类活跃买家
    const catSellers = sellersOf(agents, seller.category);
    const sellerIds = new Set(catSellers.map((s) => s.id));
    const buyerIds = new Set<string>();
    for (const tx of transactions) {
      if (tx.category !== seller.category || tx.upstream) continue;
      if (tx.status === "attested") continue;
      if (
        tx.status === "bidding" ||
        (tx.sellerId && sellerIds.has(tx.sellerId))
      ) {
        buyerIds.add(tx.buyerId);
      }
    }
    const buyers = [...buyerIds].map((id) => agents[id]).filter(Boolean);
    const nodeSet = new Set([...sellerIds, ...buyerIds]);
    return {
      nodes: [...catSellers, ...buyers],
      links: all.filter(
        (l) => !l.upstream && nodeSet.has(l.from) && nodeSet.has(l.to),
      ),
    };
  }, [agents, transactions, mode, seller]);

  const ranking = useMemo(
    () => categoryRanking(agents, seller.category),
    [agents, seller.category],
  );
  const myRank = ranking.findIndex((s) => s.id === seller.id) + 1;

  return (
    <div className="mt">
      <div className="mt-bar">
        <div className="mt-toggle">
          <button
            className={mode === "downstream" ? "on" : ""}
            onClick={() => setMode("downstream")}
          >
            下游获客战场
          </button>
          <button
            className={mode === "upstream" ? "on" : ""}
            onClick={() => setMode("upstream")}
          >
            上游采购（供应链 Agent）
          </button>
        </div>
        <div className="mt-note">
          {mode === "downstream"
            ? "金色提案光箭在争夺「进入买家决策集」的资格——没有曝光量、点击量，只有推荐决策争夺战。"
            : "你的供应链 Agent 化身买家向上游采购。上游违约会沿链传导，拉低你对买家的时效履约率。"}
        </div>
      </div>

      <div className="mt-stage">
        <TopologyCanvas
          nodes={nodes}
          links={links}
          selectedId={seller.id}
          showHeat={false}
        />

        <div className="mt-rank panel">
          <div className="eyebrow">买家 Agent 意图榜 · {seller.category}</div>
          <div className="mt-myrank">
            你当前排名 <b className="num">#{myRank || "—"}</b> /{" "}
            {ranking.length}
          </div>
          <ol className="mt-rank-list scroll-y">
            {ranking.map((s, i) => (
              <li
                key={s.id}
                className={`${s.id === seller.id ? "me" : ""} ${
                  s.flagged ? "flagged" : ""
                }`}
              >
                <span className="num mt-rk">#{i + 1}</span>
                <span className="mt-sn">{s.name}</span>
                <span className="num mt-sc">{s.credit}</span>
              </li>
            ))}
          </ol>
          <div className="mt-hint">
            排名 = 履约声誉的函数。想上升唯一办法是优化履约，无竞价、无广告位。
          </div>
        </div>
      </div>
    </div>
  );
}
