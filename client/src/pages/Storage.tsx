import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, EmptyState, DataBadge } from "../components/ui";
import AgriculturalMap from "../components/AgriculturalMap";
import { Warehouse, ShieldCheck, MapPin, Phone, Thermometer, Map as MapIcon, Grid, Navigation } from "lucide-react";

export default function Storage() {
  const { t } = useLocale();
  const [facilities, setFacilities] = useState<any[]>([]);
  const [filterCrop, setFilterCrop] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  async function loadStorage(lat?: number, lng?: number) {
    const url = lat && lng ? `/storage?lat=${lat}&lng=${lng}` : "/storage";
    const data = await api.get(url);
    setFacilities(data);
  }

  useEffect(() => { 
    loadStorage();
  }, []);

  function handleLocate() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        loadStorage(coords.lat, coords.lng);
        setLocating(false);
      },
      (err) => {
        console.warn("Geolocation denied or error:", err);
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  const filtered = facilities.filter((f) => {
    const cropMatch = filterCrop === "ALL" || f.crop_suitability?.toLowerCase().includes(filterCrop.toLowerCase());
    const typeMatch = filterType === "ALL" || (f.type && f.type.toLowerCase().includes(filterType.toLowerCase()));
    return cropMatch && typeMatch;
  });

  const mapStorageItems = filtered.map((f) => ({
    id: f.id,
    name: f.name,
    latitude: f.latitude || (f.location === "Guntur" ? 16.3067 : 15.8281),
    longitude: f.longitude || (f.location === "Guntur" ? 80.4365 : 78.0373),
    type: f.type || "Warehouse",
    capacity: `${f.capacity_quintals} quintals (${f.available_capacity_quintals} available)`,
    rate: `₹${f.cost_per_day_per_quintal} / day / q`,
    phone: f.contact,
    verified: f.verified,
  }));

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("storage.title")} 
        subtitle={t("storage.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "grid" ? "map" : "grid")}
              className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              {viewMode === "grid" ? <MapIcon size={14} /> : <Grid size={14} />}
              <span>{viewMode === "grid" ? "View on Map" : "Show List"}</span>
            </button>
            <DataBadge type="LATEST" note="APMC & WDRA registered storage facilities" />
          </div>
        }
      />

      {/* Geolocation & Filter Panel */}
      <div className="card p-3.5 space-y-3 shadow-subtle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-xs font-bold text-dark-muted uppercase tracking-wider block mb-1">
                Crop Suitability:
              </span>
              <select 
                value={filterCrop} 
                onChange={(e) => setFilterCrop(e.target.value)}
                className="input py-1.5 px-3 text-xs w-auto bg-stone-50"
              >
                <option value="ALL">All Commodities</option>
                <option value="Chilli">Chilli</option>
                <option value="Onion">Onion</option>
                <option value="Tomato">Tomato</option>
                <option value="Wheat">Wheat / Grains</option>
              </select>
            </div>

            <div>
              <span className="text-xs font-bold text-dark-muted uppercase tracking-wider block mb-1">
                Facility Type:
              </span>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="input py-1.5 px-3 text-xs w-auto bg-stone-50"
              >
                <option value="ALL">All Types</option>
                <option value="Cold Storage">Cold Storage</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Grain">Grain Storage</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleLocate}
            disabled={locating}
            className={`btn-ghost text-xs py-1.5 px-3 border rounded-xl flex items-center gap-1.5 ${
              userLocation ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-stone-300"
            }`}
          >
            <Navigation size={13} className={locating ? "animate-spin text-brand-600" : ""} />
            <span>{locating ? "Locating..." : userLocation ? "Sorted by Nearest to You" : "Find Nearest (GPS)"}</span>
          </button>
        </div>
      </div>

      {/* Map View */}
      {viewMode === "map" && (
        <AgriculturalMap
          storage={mapStorageItems}
          userLocation={userLocation}
          height="450px"
        />
      )}

      {/* List/Grid View */}
      {filtered.length === 0 ? (
        <EmptyState message={t("storage.noFacilities")} submessage="No verified facilities match the selected filter." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((f) => {
            const availPct = Math.round((f.available_capacity_quintals / f.capacity_quintals) * 100);
            return (
              <div key={f.id} className="card p-5 hover:shadow-card hover:border-brand-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                        <Warehouse size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-stone-900">{f.name}</h3>
                        <p className="text-xs text-stone-500 flex items-center gap-1">
                          <MapPin size={11} /> {f.address || f.location}, {f.district}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {f.verified && (
                        <span className="badge bg-emerald-50 text-emerald-700 border-emerald-200">
                          <ShieldCheck size={12} /> Verified
                        </span>
                      )}
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                        {f.source === "WDRA / Government Registry" ? "WDRA Verified" : "SEEDED DEMO"}
                      </span>
                    </div>
                  </div>

                  {/* Distance indicator if available */}
                  {f.distance_km && (
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50/70 px-2 py-0.5 rounded mb-2">
                      <Navigation size={11} /> Approx. {f.distance_km} km away
                    </div>
                  )}

                  {/* Badges for Type & Temperature */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <span className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                      {f.type || "Warehouse"}
                    </span>
                    {f.temperature_controlled ? (
                      <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
                        <Thermometer size={10} /> Temp Controlled (2°C - 8°C)
                      </span>
                    ) : null}
                  </div>

                  {/* Capacity Bar */}
                  <div className="my-2 p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-stone-500">Available Space</span>
                      <span className="text-brand-700 font-bold">{f.available_capacity_quintals} / {f.capacity_quintals} q ({availPct}%)</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-2 rounded-full ${availPct > 30 ? "bg-brand-600" : "bg-amber-500"}`} 
                        style={{ width: `${availPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-stone-100">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Storage Fee</span>
                      <span className="font-black text-brand-700">₹{f.cost_per_day_per_quintal} / day / q</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Contact / Desk</span>
                      <span className="font-semibold text-stone-700 flex items-center gap-1">
                        <Phone size={11} /> {f.contact || "Mandi Admin"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 text-xs text-stone-500 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-stone-700">Suitability: </span>
                    {(f.crop_suitability || "All produce").split(",").slice(0, 3).join(", ")}
                  </div>
                  {f.latitude && f.longitude && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${f.latitude},${f.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 hover:underline font-semibold flex items-center gap-1"
                    >
                      <span>Get Directions</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
