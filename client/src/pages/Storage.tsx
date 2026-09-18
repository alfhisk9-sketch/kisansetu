import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, EmptyState, DataBadge } from "../components/ui";
import { Warehouse, ShieldCheck, MapPin, Phone, CheckCircle2, Thermometer } from "lucide-react";

export default function Storage() {
  const { t } = useLocale();
  const [facilities, setFacilities] = useState<any[]>([]);
  const [filterCrop, setFilterCrop] = useState("ALL");

  useEffect(() => { 
    api.get("/storage").then(setFacilities); 
  }, []);

  const filtered = facilities.filter((f) => {
    if (filterCrop === "ALL") return true;
    return f.crop_suitability?.toLowerCase().includes(filterCrop.toLowerCase());
  });

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("storage.title")} 
        subtitle={t("storage.subtitle")}
        actions={
          <DataBadge type="LIVE" note="Verified regional cold storages and warehouses" />
        }
      />

      {/* Filter / Category Selector */}
      <div className="card p-3.5 flex items-center justify-between gap-3 shadow-subtle">
        <span className="text-xs font-bold text-dark-muted uppercase tracking-wider">
          Filter by Crop Compatibility:
        </span>
        <select 
          value={filterCrop} 
          onChange={(e) => setFilterCrop(e.target.value)}
          className="input py-1.5 px-3 text-xs w-auto bg-stone-50"
        >
          <option value="ALL">All Facilities</option>
          <option value="Onion">Onion</option>
          <option value="Tomato">Tomato</option>
          <option value="Chilli">Chilli</option>
          <option value="Wheat">Wheat / Grains</option>
        </select>
      </div>

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
                        <p className="text-xs text-stone-400 flex items-center gap-1">
                          <MapPin size={11} /> {f.location}, {f.district}
                        </p>
                      </div>
                    </div>

                    {f.verified && (
                      <span className="badge bg-emerald-50 text-emerald-700 border-emerald-200">
                        <ShieldCheck size={12} /> Verified
                      </span>
                    )}
                  </div>

                  {/* Capacity Bar */}
                  <div className="my-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
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

                <div className="mt-3 pt-2 text-xs text-stone-500">
                  <span className="font-bold text-stone-700">Crop Suitability: </span>
                  {(f.crop_suitability || "All agricultural produce").split(",").join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
