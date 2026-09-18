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
  MapPin, SlidersHorizontal, Scale, Map as MapIcon, 
  BarChart2, ExternalLink, Compass
} from "lucide-react";
import AgriculturalMap, { MapMarkerItem } from "../components/AgriculturalMap";

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
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length) setCropId(data[0].id);
    });
  }, []);

  async function runComparison(coords: [number, number] | null = userLocation) {
    if (!cropId) return;
    setLoading(true);
    try {
      let url = `/markets/compare?cropId=${cropId}&district=${district}&quantity=${quantity}&grade=${grade}`;
      if (coords) {
        url += `&userLat=${coords[0]}&userLng=${coords[1]}`;
      }
      const data = await api.get(url);
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
    if (!cropId) return;
    const url = selectedMarket ? `/markets/prices?cropId=${cropId}&marketId=${selectedMarket}` : `/markets/prices?cropId=${cropId}`;
    api.get(url).then((data) => {
      setPriceSeries(data.map((d: any) => ({ date: d.date.slice(5), price: d.modal_price })));
    });
  }, [cropId, selectedMarket]);

  const top = options[0];
  const selectedMarketOption = options.find((o) => o.marketId === selectedMarket) || top;

  const currentPrice = selectedMarketOption?.currentPrice || 0;
  const minPrice = selectedMarketOption?.minPrice || currentPrice;
  const maxPrice = selectedMarketOption?.maxPrice || currentPrice;
  const avgPrice = selectedMarketOption?.trend7DayAvg || currentPrice;
  const trendPct = selectedMarketOption?.trend7DayChangePct || 0;

  // Build Map Marker Items from real mandis
  const mapItems: MapMarkerItem[] = options.map((o: any) => ({
    id: o.marketId,
    name: o.marketName,
    type: "mandi",
    district: o.district,
    state: o.state,
    lat: Number(o.lat) || 16.2974,
    lng: Number(o.lng) || 80.4578,
    priceText: `₹${o.currentPrice}/q`,
    distanceKm: o.distanceKm,
    source: o.source,
  }));

  function handleLocationFound(lat: number, lng: number) {
    setUserLocation([lat, lng]);
    runComparison([lat, lng]);
  }

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("marketIntel.title")} 
        subtitle={t("marketIntel.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-stone-100 border border-stone-200">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "list" ? "bg-white text-brand-800 shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <BarChart2 size={13} /> Analytics
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === "map" ? "bg-brand-600 text-white shadow-xs" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <MapIcon size={13} /> Mandi Map
              </button>
            </div>

            <Link to="/compare" className="btn-secondary text-xs">
              <Scale size={14} /> Compare All Mandis
            </Link>
          </div>
        }
      />

      {/* Official Data Provenance & Freshness Banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-brand-50/70 via-emerald-50/40 to-white border border-brand-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-stone-500 font-medium">Primary Source:</span>
          <span className="font-bold text-stone-900">
            {top?.source || "Government of India / AGMARKNET"}
          </span>
          <a 
            href={top?.sourceUrl || "https://agmarknet.gov.in"} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="font-semibold text-brand-700 underline inline-flex items-center gap-0.5 hover:text-brand-900"
          >
            agmarknet.gov.in <ExternalLink size={10} />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <DataBadge type={(top?.dataStatus as any) || "LATEST AVAILABLE"} />
          <span className="text-[11px] text-stone-500 font-medium">
            Updated: {top?.updatedAt || new Date().toISOString().split("T")[0]}
          </span>
        </div>
      </div>

      {/* Filter / Selector Control Panel */}
      <div className="card p-5 bg-white shadow-subtle">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dark-muted">
            <SlidersHorizontal size={14} className="text-brand-600" />
            <span>Market Parameters</span>
          </div>
          {userLocation && (
            <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
              📍 Using GPS Coordinates ({userLocation[0].toFixed(2)}°, {userLocation[1].toFixed(2)}°)
            </span>
          )}
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
              {["Guntur","Krishna","Kurnool","Anantapur","Nellore","Chittoor","Kadapa","Visakhapatnam","West Godavari","East Godavari","Nashik","Warangal","Indore"].map((d) => <option key={d} value={d}>{d}</option>)}
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

      {/* Map View Toggle Panel */}
      {viewMode === "map" ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-stone-900">Regional APMC Mandi & Storage Network</h3>
              <p className="text-xs text-stone-500">Showing verified government mandis with modal prices and storage hubs</p>
            </div>
          </div>
          <AgriculturalMap 
            items={mapItems}
            userLocation={userLocation}
            onLocationFound={handleLocationFound}
            height="460px"
          />
        </div>
      ) : (
        <>
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
              sub="Recorded range"
            />
            <StatCard 
              label="Average Price" 
              value={`₹${avgPrice}/q`}
              sub="7-day moving avg"
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
                      {selectedMarketOption.distanceKm} km (approx.)
                    </span>
                    <DataBadge type={(selectedMarketOption.dataStatus as any) || "LATEST AVAILABLE"} />
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
                <p className="text-xs text-stone-500">Verified modal arrival price series from AGMARKNET</p>
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
        </>
      )}
    </div>
  );
}
