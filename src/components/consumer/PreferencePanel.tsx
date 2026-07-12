import { useWorld } from "../../core/store";
import type { Preference } from "../../core/types";

const DIMS: Array<{ key: keyof Preference; label: string; color: string }> = [
  { key: "timeliness", label: "时效", color: "var(--color-data)" },
  { key: "spec", label: "品质", color: "var(--color-verify)" },
  { key: "price", label: "价格", color: "var(--color-fulfil)" },
  { key: "afterSales", label: "售后", color: "var(--color-proposal)" },
];

export function PreferencePanel() {
  const preference = useWorld((s) => s.preference);
  const setPreference = useWorld((s) => s.setPreference);
  const total =
    preference.timeliness +
    preference.spec +
    preference.price +
    preference.afterSales;

  return (
    <div className="pref-panel">
      <div className="eyebrow">偏好权重 · 决策集实时重排</div>
      <div className="pref-sliders">
        {DIMS.map((d) => {
          const v = preference[d.key];
          const share = total ? Math.round((v / total) * 100) : 0;
          return (
            <label key={d.key} className="pref-row">
              <span className="pref-label">{d.label}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={v}
                onChange={(e) => setPreference({ [d.key]: +e.target.value })}
                style={{ accentColor: d.color }}
              />
              <span className="pref-share num">{share}%</span>
            </label>
          );
        })}
      </div>
      <div className="pref-hint">
        重时效 → 时效分权重拉满；重品质 → 自动过滤掺假记录卖家。
      </div>
    </div>
  );
}
