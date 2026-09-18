import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { translateReasons } from "../i18n/serverTextTranslator";
import { api } from "../lib/api";
import { 
  SectionHeading, DataBadge, ScoreBar, StatCard, 
  NetRealizationCard, SkeletonCard 
} from "../components/ui";
import { Link } from "react-router-dom";
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend 
} from "recharts";
import { Crop, MarketOption } from "../lib/types";
import { 
  TrendingUp, TrendingDown, ArrowRight, ShieldCheck, 
  MapPin, SlidersHorizontal, Scale 
} from "lucide-react";

export default function MarketIntelligence() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropId, setCropId] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [district, setDistrict] = useState(profile?.district || "Guntur");
  const [grade, setGrade] = useState("A");
  const [options, setOptions] = useState<MarketOption[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string>("");
  const [priceSeries, setPriceSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length) setCropId(data[0].id);
    });
  }, []);

  async function runComparison() {
    if (!cropId) return;
    setLoading(true);
    try {
      const data = await api.get(`/markets/compare?cropId=${cropId}&district=${district}&quantity=${quantity}&grade=${grade}`);
      setOptions(data.options || []);
      if (data.options?.length) {
        setSelectedMarket(data.options[0].marketId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (cropId) runComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropId, district, grade]);

  useEffect(() => {
    if (cropId && selectedMarket) {
      api.get(`/markets/prices?cropId=${cropId}&marketId=${selectedMarket}`).then((rows) =>
        setPriceSeries(rows.map((r: any) => ({ date: r.date.slice(5), price: r.modal_price })))
      );
    }
  }, [cropId, selectedMarket]);

  const top = options[0];
  const selectedMarketOption = options.find((o) => o.marketId === selectedMarket) || top;

  // Compute summary stats from price series
  const prices = priceSeries.map((p) => p.price);
  const currentPrice = prices.length ? prices[prices.length - 1] : (top?.currentPrice || 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const trendPct = selectedMarketOption?.trend7DayChangePct || 0;

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("marketIntel.title")} 
        subtitle={t("marketIntel.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <DataBadge type="LIVE" note="Verified regional APMC mandi prices" />
            <Link to="/compare" className="btn-secondary text-xs">
              <Scale size={14} /> Compare All Mandis
            </Link>
          </div>
        }
      />

      {/* Filter / Selector Control Panel */}
      <div className="card p-5 bg-white shadow-subtle">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dark-muted mb-3">
          <SlidersHorizontal size={14} className="text-brand-600" />
          <span>Market Parameters</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">{t("common.fields.crop")}</label>
            <select className="input" value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("common.fields.quantity")}</label>
            <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label">{t("common.fields.yourDistrict")}</label>
            <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {["Guntur","Krishna","Kurnool","Anantapur","Nellore","Chittoor","Kadapa","Visakhapatnam","West Godavari","East Godavari"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("common.fields.qualityGrade")}</label>
            <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="A">Grade A (Verified Premium)</option>
              <option value="B">Grade B (Standard)</option>
              <option value="C">Grade C (Fair Average Quality)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard 
          label="Current Modal Price" 
          value={`₹${currentPrice}/q`}
          trend={`${trendPct >= 0 ? "+" : ""}${trendPct}% (7 days)`}
          trendPositive={trendPct >= 0}
        />
        <StatCard 
          label="Price Range" 
          value={`₹${minPrice} - ₹${maxPrice}`}
          sub="30-day recorded range"
        />
        <StatCard 
          label="Average Price" 
          value={`₹${avgPrice}/q`}
          sub="Moving average"
        />
        <StatCard 
          label="Recommended Mandi" 
          value={top?.marketName?.split(" ")[0] || "Guntur"}
          sub={`Score: ${top?.recommendationScore || 85}/100`}
        />
      </div>

      {/* Top Recommendation & Transparent Formula */}
      {selectedMarketOption && (
        <div className="card p-5 border-brand-300 bg-gradient-to-r from-emerald-50/40 via-white to-brand-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">
                  ★ Highest Take-Home Mandi
                </span>
                <span className="text-xs font-semibold text-stone-500">
                  {selectedMarketOption.distanceKm} km away
                </span>
              </div>
              <h3 className="text-lg font-bold text-stone-900 mt-1">
                {selectedMarketOption.marketName} ({selectedMarketOption.district})
              </h3>
            </div>
            <div className="text-right sm:text-right">
              <span className="text-xs text-stone-500 block">Estimated Net Realization</span>
              <span className="text-2xl font-black text-brand-700">₹{selectedMarketOption.netRealizationPerQuintal}/q</span>
            </div>
          </div>

          <NetRealizationCard 
            salePrice={selectedMarketOption.currentPrice}
            transportCost={selectedMarketOption.transportCostPerQuintal}
            marketCharges={Math.round(selectedMarketOption.currentPrice * 0.03 + 10)}
            netRealization={selectedMarketOption.netRealizationPerQuintal}
          />
        </div>
      )}

      {/* Recharts Price Trend Chart */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-sm text-stone-900">Historical Price Trend</h3>
            <p className="text-xs text-stone-500">Mandi modal arrival price series over time</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-600">Select Market:</span>
            <select 
              value={selectedMarket} 
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="input text-xs py-1 px-2 w-auto bg-stone-50"
            >
              {options.map((o) => (
                <option key={o.marketId} value={o.marketId}>
                  {o.marketName} (₹{o.currentPrice}/q)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ width: "100%", height: 260 }}>
          {priceSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-stone-400">
              No historical price points recorded for this pair.
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={priceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip 
                  formatter={(val: any) => [`₹${val}/quintal`, "Modal Price"]}
                  contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#0B6E4F" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: "#0B6E4F" }} 
                  activeDot={{ r: 5 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
