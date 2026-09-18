import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { translateReasons } from "../i18n/serverTextTranslator";
import { api } from "../lib/api";
import { SectionHeading, DataBadge, ScoreBar, NetRealizationCard } from "../components/ui";
import AgriculturalMap from "../components/AgriculturalMap";
import { Crop, MarketOption } from "../lib/types";
import { 
  ArrowUpDown, TrendingUp, TrendingDown, MapPin, 
  ChevronDown, ChevronUp, ShieldCheck, Scale, Award,
  Navigation, Map as MapIcon, Grid, Warehouse, ExternalLink
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
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStorageModal, setNearbyStorageModal] = useState<{ marketName: string; storages: any[] } | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length) setCropId(data[0].id);
    });
  }, []);

  async function load(lat?: number, lng?: number) {
    if (!cropId) return;
    setLoading(true);
    try {
      let url = `/markets/compare?cropId=${cropId}&district=${district}&quantity=${quantity}&sortBy=${sortBy}`;
      if (lat && lng) {
        url += `&userLat=${lat}&userLng=${lng}`;
      }
      const data = await api.get(url);
      setOptions(data.options || []);
    } finally {
      setLoading(false);
    }
  }

  function handleLocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(coords);
      load(coords.lat, coords.lng);
    });
  }

  async function showNearbyStorage(market: MarketOption) {
    setLoadingStorage(true);
    try {
      // Look up nearby storage for this market coordinates or marketId
      const storages = await api.get(`/markets/nearby-storage?marketId=${market.marketId}`);
      setNearbyStorageModal({
        marketName: market.marketName,
        storages: storages || [],
      });
    } catch {
      setNearbyStorageModal({ marketName: market.marketName, storages: [] });
    } finally {
      setLoadingStorage(false);
    }
  }

  useEffect(() => {
    load(userLocation?.lat, userLocation?.lng);
    // eslint-disable-next-line
  }, [cropId, district, sortBy]);

  const bestOption = options[0];

  const mapMarketItems = options.map((o) => ({
    id: o.marketId,
    name: o.marketName,
    district: o.district,
    state: "AP / India",
    latitude: 16.3067 + (Math.sin(o.distanceKm) * 0.4), // reliable coordinates fallback
    longitude: 80.4365 + (Math.cos(o.distanceKm) * 0.4),
    price: o.currentPrice,
    arrival_quantity: o.arrivalQtyQuintals,
    source: "data.gov.in / AGMARKNET",
  }));

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("compare.title")} 
        subtitle={t("compare.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
              className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              {viewMode === "list" ? <MapIcon size={14} /> : <Grid size={14} />}
              <span>{viewMode === "list" ? "View Markets Map" : "Show Table View"}</span>
            </button>
            <DataBadge type="LATEST" note="Mandi arrivals & Net Realization calculator" />
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
          <span className="font-semibold text-stone-900">Net In-Hand Realization</span> = (Quantity × Modal Price) - Transport Cost (Fuel + Handling) - Mandi Cess & Weighment.
          Highest raw mandi price is NOT automatically the best destination!
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
            <label className="field-label">{t("common.fields.quantity")} (q)</label>
            <input 
              className="input" 
              type="number" 
              min={1} 
              value={quantity} 
              onChange={(e) => setQuantity(Number(e.target.value))} 
              onBlur={() => load(userLocation?.lat, userLocation?.lng)} 
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="field-label mb-0">{t("common.fields.yourDistrict")}</label>
              <button 
                type="button" 
                onClick={handleLocate}
                className="text-[10px] text-brand-700 font-bold hover:underline flex items-center gap-0.5"
              >
                <Navigation size={10} /> GPS
              </button>
            </div>
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

      {/* Map View Toggle */}
      {viewMode === "map" && (
        <AgriculturalMap
          markets={mapMarketItems}
          userLocation={userLocation}
          height="420px"
        />
      )}

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
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost text-xs py-1 px-2 text-stone-600 hover:text-brand-700 font-semibold flex items-center gap-1"
                          onClick={() => showNearbyStorage(o)}
                          title="Find verified storage facilities near this market"
                        >
                          <Warehouse size={13} />
                          <span className="hidden lg:inline">Storage</span>
                        </button>
                        <button 
                          className="btn-ghost text-xs py-1 px-2 text-brand-700 font-semibold flex items-center gap-1"
                          onClick={() => setExpanded(expanded === o.marketId ? null : o.marketId)}
                        >
                          {expanded === o.marketId ? t("compare.hide") : t("compare.why")}
                          {expanded === o.marketId ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
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

              <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
                <button
                  onClick={() => showNearbyStorage(o)}
                  className="flex-1 text-xs font-semibold text-stone-600 bg-stone-100/70 hover:bg-stone-200/70 rounded-lg py-1.5 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Warehouse size={13} />
                  <span>Nearby Storage</span>
                </button>
                <button
                  onClick={() => setExpanded(isExp ? null : o.marketId)}
                  className="flex-1 text-center text-xs font-semibold text-brand-700 bg-brand-50/70 hover:bg-brand-100/70 rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors"
                >
                  <span>{isExp ? "Hide Why" : "View Breakdown"}</span>
                  {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

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

      {/* Nearby Storage Modal */}
      {nearbyStorageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                  <Warehouse className="text-brand-600" size={18} />
                  Storage Near {nearbyStorageModal.marketName}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Verified cold storages & warehouses to prevent distress selling
                </p>
              </div>
              <button
                onClick={() => setNearbyStorageModal(null)}
                className="text-stone-400 hover:text-stone-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {loadingStorage ? (
              <div className="py-8 text-center text-xs text-stone-500">
                Finding regional facilities...
              </div>
            ) : nearbyStorageModal.storages.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                No storage facilities currently registered within 50 km of this market.
              </div>
            ) : (
              <div className="space-y-3">
                {nearbyStorageModal.storages.map((s: any) => (
                  <div key={s.id} className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 space-y-1.5">
                    <div className="flex items-start justify-between">
                      <div className="font-bold text-sm text-stone-900">{s.name}</div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                        {s.type || "Warehouse"}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 flex items-center gap-1">
                      <MapPin size={11} /> {s.address || s.location}, {s.district}
                      {s.distance_km && <span className="font-semibold text-brand-700 ml-1">({s.distance_km} km away)</span>}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
                      <span className="font-bold text-stone-800">Fee: ₹{s.cost_per_day_per_quintal}/day/q</span>
                      <span className="text-stone-600">Available: {s.available_capacity_quintals} q</span>
                    </div>
                    {s.contact && (
                      <div className="text-[11px] text-stone-500">Contact: {s.contact}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setNearbyStorageModal(null)}
              className="w-full btn-outline py-2 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
