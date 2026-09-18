import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, StatCard, EmptyState, DataBadge } from "../components/ui";
import { 
  LineChart as LineChartIcon, TrendingUp, TrendingDown, 
  HelpCircle, ShieldCheck, Sparkles, BarChart2 
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, ReferenceLine 
} from "recharts";
import { Crop } from "../lib/types";

interface Market {
  id: string;
  name: string;
  district: string;
}

interface ForecastResult {
  predictedPrice: number;
  mae: number;
  rmse: number;
  r2: number;
  trainedOnRows: number;
  method: string;
  note: string;
}

interface InsufficientData {
  error: string;
  trainedOnRows: number;
}

export default function Forecast() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [cropId, setCropId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [horizonDays, setHorizonDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [insufficient, setInsufficient] = useState<InsufficientData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<any[]>([]);

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length) setCropId(data[0].id);
    });
    api.get("/markets").then((data) => {
      setMarkets(data);
      if (data.length) setMarketId(data[0].id);
    });
  }, []);

  async function runForecast() {
    if (!cropId || !marketId) return;
    if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
      setError(t("forecast.invalidHorizon"));
      setResult(null);
      setInsufficient(null);
      setHasRun(true);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setInsufficient(null);

    try {
      // Load both forecast calculation and recent history for projection charting
      const [data, priceHistory] = await Promise.all([
        api.get(`/forecast?cropId=${cropId}&marketId=${marketId}&horizonDays=${horizonDays}`),
        api.get(`/markets/prices?cropId=${cropId}&marketId=${marketId}`)
      ]);

      if (data.error) {
        setInsufficient(data);
      } else {
        setResult(data);
      }

      if (Array.isArray(priceHistory) && priceHistory.length > 0) {
        const points: any[] = priceHistory.slice(-14).map((p: any) => ({
          date: p.date.slice(5),
          price: p.modal_price,
          type: "Historical"
        }));

        if (!data.error && data.predictedPrice) {
          points.push({
            date: `+${horizonDays}d (Forecast)`,
            price: data.predictedPrice,
            forecast: data.predictedPrice,
            type: "Projected"
          });
        }
        setHistoryPoints(points);
      }
    } catch (e: any) {
      setError(e.message || t("forecast.requestFailed"));
    } finally {
      setLoading(false);
      setHasRun(true);
    }
  }

  useEffect(() => {
    if (cropId && marketId) {
      runForecast();
    }
    // eslint-disable-next-line
  }, [cropId, marketId]);

  const selectedCrop = crops.find((c) => c.id === cropId);
  const selectedMarket = markets.find((m) => m.id === marketId);
  const lastKnownPrice = historyPoints.length > 1 ? historyPoints[historyPoints.length - 2]?.price : null;
  const priceDiff = result && lastKnownPrice ? Math.round(result.predictedPrice - lastKnownPrice) : null;

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("forecast.title")} 
        subtitle={t("forecast.subtitle")}
        actions={
          <DataBadge type="FORECAST" note="Ridge-regression deterministic baseline model" />
        }
      />

      {/* Model Parameters Control */}
      <div className="card p-5 bg-white shadow-subtle">
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="field-label">{t("common.fields.crop")}</label>
            <select className="input" value={cropId} onChange={(e) => setCropId(e.target.value)}>
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("common.fields.market")}</label>
            <select className="input" value={marketId} onChange={(e) => setMarketId(e.target.value)}>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.district})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("forecast.horizonLabel")}</label>
            <input 
              className="input" 
              type="number" 
              min={1} 
              max={30} 
              value={horizonDays} 
              onChange={(e) => setHorizonDays(Number(e.target.value))} 
            />
          </div>
          <div>
            <button 
              className="btn-primary w-full text-xs py-2" 
              onClick={runForecast} 
              disabled={loading}
            >
              <BarChart2 size={15} /> {loading ? "Forecasting..." : t("forecast.runButton")}
            </button>
          </div>
        </div>
      </div>

      {/* Insufficient Data State */}
      {insufficient && (
        <div className="card p-5 bg-amber-50/70 border-amber-200 text-amber-900">
          <div className="flex items-center gap-2 font-bold text-sm mb-1">
            <HelpCircle size={17} className="text-amber-600" />
            <span>Insufficient Historical Mandi Rows</span>
          </div>
          <p className="text-xs text-amber-800">
            This crop/market pair has only {insufficient.trainedOnRows} recorded row(s). A minimum of 7 consecutive price points is required to avoid misleading projections.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-4 bg-red-50 text-red-700 border-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Forecast Result Metrics */}
      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard 
              label={`Predicted Price (+${horizonDays}d)`} 
              value={`₹${result.predictedPrice}/q`}
              trend={priceDiff !== null ? `${priceDiff >= 0 ? "+" : ""}₹${priceDiff} from current` : undefined}
              trendPositive={priceDiff !== null && priceDiff >= 0}
            />
            <StatCard 
              label="Mean Abs Error (MAE)" 
              value={`±₹${result.mae}/q`}
              sub="Avg test residual deviation"
            />
            <StatCard 
              label="Goodness of Fit (R²)" 
              value={result.r2}
              sub={`${result.trainedOnRows} training arrivals`}
            />
            <StatCard 
              label="Model Architecture" 
              value="Ridge L2"
              sub="Deterministic regression"
            />
          </div>

          {/* Historical vs Projection Chart */}
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-sm text-stone-900">
                  {selectedCrop?.name} Price Projection at {selectedMarket?.name}
                </h3>
                <p className="text-xs text-stone-500">
                  Historical mandi prices leading to {horizonDays}-day horizon forecast
                </p>
              </div>
              <DataBadge type="ESTIMATED" note="Empirical statistical estimate, not a guaranteed contract" />
            </div>

            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={historyPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip 
                    formatter={(val: any) => [`₹${val}/q`, "Price"]}
                    contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#0B6E4F" 
                    strokeWidth={2.5} 
                    dot={{ r: 3, fill: "#0B6E4F" }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Transparent Model Card Note */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80 text-xs text-stone-600 space-y-1">
            <span className="font-bold text-stone-900 block">Statistical Transparency:</span>
            <p className="leading-relaxed">
              {result.note || "Trained strictly on historical mandi modal arrival rates. Actual realizable prices fluctuate based on weather events, daily arrivals, transport availability, and buyer grade inspection."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
