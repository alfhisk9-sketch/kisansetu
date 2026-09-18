import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { translateReasons } from "../i18n/serverTextTranslator";
import { api } from "../lib/api";
import { SectionHeading, DataBadge, ScoreBar, NetRealizationCard } from "../components/ui";
import { Crop, MarketOption } from "../lib/types";
import { 
  ArrowUpDown, TrendingUp, TrendingDown, MapPin, 
  ChevronDown, ChevronUp, ShieldCheck, Scale, Award
} from "lucide-react";

const SORTS = [
  { key: "net", labelKey: "compare.sortNet" },
  { key: "price", labelKey: "compare.sortPrice" },
  { key: "distance", labelKey: "compare.sortDistance" },
  { key: "demand", labelKey: "compare.sortDemand" },
];

export default function MarketComparison() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropId, setCropId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [district, setDistrict] = useState(profile?.district || "Guntur");
  const [sortBy, setSortBy] = useState("net");
  const [options, setOptions] = useState<MarketOption[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length) setCropId(data[0].id);
    });
  }, []);

  async function load() {
    if (!cropId) return;
    setLoading(true);
    try {
      const data = await api.get(`/markets/compare?cropId=${cropId}&district=${district}&quantity=${quantity}&sortBy=${sortBy}`);
      setOptions(data.options || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [cropId, district, sortBy]);

  const bestOption = options[0];

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("compare.title")} 
        subtitle={t("compare.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <DataBadge type="LIVE" note="Real-time mandi arrival & distance engine" />
          </div>
        }
      />

      {/* Transparent Calculation Banner */}
      <div className="card p-4 bg-brand-50/50 border-brand-200 text-xs">
        <div className="flex items-center gap-2 font-bold text-brand-900 mb-1">
          <ShieldCheck size={16} className="text-brand-600" />
          <span>Transparent Take-Home Formula:</span>
        </div>
        <p className="text-stone-600 leading-relaxed">
          <span className="font-semibold text-stone-900">Net In-Hand Realization</span> = Mandi Headline Price - Transport Cost (Fuel + Handling) - Mandi Cess & Weighment Fees.
          Never judge a market by the raw headline price alone!
        </p>
      </div>

      {/* Control Filter Panel */}
      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">{t("common.fields.crop")}</label>
            <select className="input" value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("common.fields.quantity")}</label>
            <input 
              className="input" 
              type="number" 
              min={1} 
              value={quantity} 
              onChange={(e) => setQuantity(Number(e.target.value))} 
              onBlur={load} 
            />
          </div>
          <div>
            <label className="field-label">{t("common.fields.yourDistrict")}</label>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {["Guntur","Krishna","Kurnool","Anantapur","Nellore","Chittoor","Kadapa","Visakhapatnam","West Godavari","East Godavari"].map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("compare.sortByLabel")}</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Desktop Table View (Hidden on mobile) */}
      <div className="hidden md:block card overflow-hidden shadow-subtle">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("compare.tableMarket")}</th>
                <th>{t("compare.tableDistance")}</th>
                <th>{t("compare.tablePrice")}</th>
                <th>{t("compare.tableTrend")}</th>
                <th>{t("compare.tableArrivals")}</th>
                <th>{t("compare.tableTransport")}</th>
                <th>{t("compare.tableNet")}</th>
                <th>{t("compare.tableDemand")}</th>
                <th>{t("compare.tableScore")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {options.map((o, idx) => (
                <React.Fragment key={o.marketId}>
                  <tr 
                    className={idx === 0 ? "bg-emerald-50/50 hover:bg-emerald-50/80 font-medium" : ""}
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        {idx === 0 && <span className="text-amber-500 font-bold">★</span>}
                        <span className="font-bold text-stone-900">{o.marketName}</span>
                      </div>
                      <div className="text-xs text-stone-400">{o.district}</div>
                    </td>
                    <td>{o.distanceKm} km</td>
                    <td className="font-semibold text-stone-800">₹{o.currentPrice}</td>
                    <td>
                      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                        (o.trend7DayChangePct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {(o.trend7DayChangePct ?? 0) >= 0 ? "+" : ""}{o.trend7DayChangePct}%
                      </span>
                    </td>
                    <td>{o.arrivalQtyQuintals ? `${o.arrivalQtyQuintals} q` : "—"}</td>
                    <td className="text-stone-600">₹{o.transportCostPerQuintal}</td>
                    <td>
                      <span className="text-base font-black text-brand-700">
                        ₹{o.netRealizationPerQuintal}
                      </span>
                    </td>
                    <td>
                      <span className="badge bg-stone-100 text-stone-700 border-stone-200">
                        {t(`common.demandLevels.${o.demandLevel}`)}
                      </span>
                    </td>
                    <td>
                      <div className="font-bold text-stone-800">{o.recommendationScore}/100</div>
                    </td>
                    <td>
                      <button 
                        className="btn-ghost text-xs py-1 px-2 text-brand-700 font-semibold flex items-center gap-1"
                        onClick={() => setExpanded(expanded === o.marketId ? null : o.marketId)}
                      >
                        {expanded === o.marketId ? t("compare.hide") : t("compare.why")}
                        {expanded === o.marketId ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                  </tr>
                  {expanded === o.marketId && (
                    <tr className="bg-stone-50/70 border-b border-stone-200">
                      <td colSpan={10} className="p-4">
                        <div className="text-xs space-y-2">
                          <div className="font-bold text-stone-800">Recommendation Factors:</div>
                          <ul className="list-disc list-inside space-y-1 text-stone-600">
                            {translateReasons(t, o.reasons).map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                          {o.scoreComponents && (
                            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-stone-200 max-w-xl">
                              <ScoreBar label="Net Price" value={o.scoreComponents.priceScore} max={40} />
                              <ScoreBar label="Logistics" value={o.scoreComponents.logisticsScore} max={25} />
                              <ScoreBar label="Demand" value={o.scoreComponents.demandScore} max={15} />
                              <ScoreBar label="Timing" value={o.scoreComponents.timingScore} max={10} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Responsive Cards (Visible on mobile/tablet) */}
      <div className="md:hidden space-y-3">
        {options.map((o, idx) => {
          const isExp = expanded === o.marketId;
          return (
            <div 
              key={o.marketId} 
              className={`card p-4 border transition-all ${
                idx === 0 ? "border-brand-400 bg-brand-50/30 shadow-card" : "border-stone-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    {idx === 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        ★ Best Choice
                      </span>
                    )}
                    <span className="text-xs text-stone-500">{o.distanceKm} km away</span>
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mt-1">{o.marketName}</h3>
                  <div className="text-xs text-stone-400">{o.district}</div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-stone-500 uppercase font-semibold">Net In-Hand</div>
                  <div className="text-xl font-black text-brand-700">₹{o.netRealizationPerQuintal}</div>
                  <div className="text-[11px] text-stone-400">Headline ₹{o.currentPrice}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2.5 my-2.5 border-y border-stone-100 text-xs">
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase">Transport</span>
                  <span className="font-semibold text-stone-800">-₹{o.transportCostPerQuintal}/q</span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase">7d Trend</span>
                  <span className={`font-semibold ${
                    (o.trend7DayChangePct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}>
                    {(o.trend7DayChangePct ?? 0) >= 0 ? "+" : ""}{o.trend7DayChangePct}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block uppercase">Score</span>
                  <span className="font-bold text-stone-900">{o.recommendationScore}/100</span>
                </div>
              </div>

              <button
                onClick={() => setExpanded(isExp ? null : o.marketId)}
                className="w-full text-center text-xs font-semibold text-brand-700 flex items-center justify-center gap-1 py-1"
              >
                <span>{isExp ? "Hide Score Breakdown" : "View Recommendation Breakdown"}</span>
                {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {isExp && (
                <div className="mt-2 pt-2 border-t border-stone-100 text-xs space-y-2">
                  <div className="font-bold text-stone-800">Key Factors:</div>
                  <ul className="list-disc list-inside space-y-1 text-stone-600 text-[11px]">
                    {translateReasons(t, o.reasons).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
