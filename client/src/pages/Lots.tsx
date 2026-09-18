import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, StatusBadge, EmptyState, DataBadge } from "../components/ui";
import { Link } from "react-router-dom";
import { 
  Plus, PackagePlus, ArrowRight, ArrowLeft, CheckCircle2, 
  Calendar, MapPin, Tag, ShieldCheck, Warehouse, Sparkles 
} from "lucide-react";
import { Crop } from "../lib/types";

export default function Lots() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [lots, setLots] = useState<any[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<any>({
    cropId: "", 
    variety: "", 
    quantityQuintals: 20, 
    grade: "A", 
    location: profile?.village || "Duggirala",
    district: profile?.district || "Guntur", 
    harvestDate: new Date().toISOString().slice(0, 10), 
    availableFrom: new Date().toISOString().slice(0, 10), 
    expectedPrice: 2800, 
    minAcceptablePrice: 2500, 
    storageAvailable: false,
    notes: ""
  });

  async function load() {
    const ownerId = profile?.id;
    const data = await api.get(`/lots?ownerId=${ownerId}&ownerType=${user?.role}`);
    setLots(data);
  }

  useEffect(() => {
    api.get("/crops").then((data) => { 
      setCrops(data); 
      setForm((f: any) => ({ ...f, cropId: data[0]?.id })); 
    });
    if (profile) load();
    // eslint-disable-next-line
  }, [profile]);

  async function createLot(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/lots", { ...form, ownerId: profile?.id, ownerType: user?.role });
      setShowWizard(false);
      setStep(1);
      load();
    } finally {
      setSaving(false);
    }
  }

  const selectedCropObj = crops.find((c) => c.id === form.cropId);

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("lots.title")} 
        subtitle={t("lots.subtitle")}
        actions={
          <button 
            className="btn-primary text-xs" 
            onClick={() => { setShowWizard(!showWizard); setStep(1); }}
          >
            <Plus size={16} /> {showWizard ? t("common.cancel") : t("lots.createLot")}
          </button>
        }
      />

      {/* Stepped Lot Creation Wizard */}
      {showWizard && (
        <div className="card p-6 border-brand-300 shadow-card bg-white animate-in fade-in">
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-bold text-dark-muted mb-2">
              <span className="text-brand-700">Step {step} of 4: {
                step === 1 ? "Crop & Variety" :
                step === 2 ? "Quantity & Quality Grade" :
                step === 3 ? "Location & Target Pricing" :
                "Review & Publish Produce Lot"
              }</span>
              <span>{step * 25}% Complete</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2">
              <div 
                className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${step * 25}%` }}
              />
            </div>
          </div>

          <form onSubmit={createLot}>
            {/* Step 1: Crop & Variety */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">{t("common.fields.crop")}</label>
                    <select 
                      className="input" 
                      value={form.cropId} 
                      onChange={(e) => setForm({ ...form, cropId: e.target.value })}
                    >
                      {crops.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.category})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("lots.varietyLabel")}</label>
                    <input 
                      className="input" 
                      value={form.variety} 
                      onChange={(e) => setForm({ ...form, variety: e.target.value })} 
                      placeholder="e.g. Teja, Byadagi, Desi, Hybrid" 
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-brand-50/50 rounded-xl text-xs text-stone-600 border border-brand-100">
                  <span className="font-bold text-brand-900 block mb-0.5">Agricultural Guidance:</span>
                  Accurate variety identification increases buyer match rates and prevents post-arrival rejection.
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="button" 
                    onClick={() => setStep(2)} 
                    className="btn-primary text-xs"
                  >
                    Next: Quantity & Quality <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Quantity & Quality Grade */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">{t("common.fields.quantity")} (in Quintals)</label>
                    <input 
                      className="input" 
                      type="number" 
                      min={1} 
                      value={form.quantityQuintals} 
                      onChange={(e) => setForm({ ...form, quantityQuintals: Number(e.target.value) })} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("lots.gradeSelfLabel")}</label>
                    <select 
                      className="input" 
                      value={form.grade} 
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    >
                      <option value="A">Grade A (Premium — &lt;3% damage, uniform color, low moisture)</option>
                      <option value="B">Grade B (Standard Market Quality)</option>
                      <option value="C">Grade C (Industrial / Processing Grade)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/60 rounded-xl text-xs text-amber-800 border border-amber-200">
                  <span className="font-bold block mb-0.5">Quality Assurance:</span>
                  Lots self-assessed as Grade A receive priority buyer bidding, but can be assayed upon mandi delivery.
                </div>

                <div className="flex justify-between pt-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary text-xs">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="button" onClick={() => setStep(3)} className="btn-primary text-xs">
                    Next: Pricing & Location <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Location, Harvest & Pricing */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="field-label">{t("lots.locationLabel")} (Village / Town)</label>
                    <input 
                      className="input" 
                      value={form.location} 
                      onChange={(e) => setForm({ ...form, location: e.target.value })} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="field-label">{t("common.fields.district")}</label>
                    <select 
                      className="input" 
                      value={form.district} 
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                    >
                      {["Guntur","Krishna","Kurnool","Anantapur","Nellore","Chittoor","Kadapa","Visakhapatnam","West Godavari","East Godavari"].map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("lots.expectedPrice")} (₹ / quintal)</label>
                    <input 
                      className="input font-bold text-brand-700" 
                      type="number" 
                      value={form.expectedPrice} 
                      onChange={(e) => setForm({ ...form, expectedPrice: Number(e.target.value) })} 
                      required
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">{t("lots.minAcceptablePrice")} (Floor Reserve ₹ / q)</label>
                    <input 
                      className="input" 
                      type="number" 
                      value={form.minAcceptablePrice} 
                      onChange={(e) => setForm({ ...form, minAcceptablePrice: Number(e.target.value) })} 
                    />
                  </div>
                  <div>
                    <label className="field-label">Available From Date</label>
                    <input 
                      className="input" 
                      type="date" 
                      value={form.availableFrom} 
                      onChange={(e) => setForm({ ...form, availableFrom: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="storageCheck"
                    checked={form.storageAvailable} 
                    onChange={(e) => setForm({ ...form, storageAvailable: e.target.checked })}
                    className="w-4 h-4 text-brand-600 rounded" 
                  />
                  <label htmlFor="storageCheck" className="text-xs text-stone-700 font-medium cursor-pointer">
                    Produce is currently in warehouse / cold storage facility
                  </label>
                </div>

                <div className="flex justify-between pt-2">
                  <button type="button" onClick={() => setStep(2)} className="btn-secondary text-xs">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="button" onClick={() => setStep(4)} className="btn-primary text-xs">
                    Next: Final Review <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Final Review & Publish */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-2.5">
                  <div className="font-bold text-sm text-stone-900 border-b border-stone-200 pb-1.5 flex items-center justify-between">
                    <span>Lot Summary Review</span>
                    <span className="badge bg-brand-50 text-brand-700 border-brand-200">
                      Ready to Publish
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-stone-700 pt-1">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Crop</span>
                      <span className="font-bold text-stone-900">{selectedCropObj?.name || "Produce"}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Quantity</span>
                      <span className="font-bold text-stone-900">{form.quantityQuintals} Quintals</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Grade</span>
                      <span className="font-bold text-stone-900">Grade {form.grade}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Expected Price</span>
                      <span className="font-bold text-brand-700">₹{form.expectedPrice}/q</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Reserve Floor</span>
                      <span className="font-medium text-stone-800">₹{form.minAcceptablePrice}/q</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Location</span>
                      <span className="font-medium text-stone-800">{form.location}, {form.district}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Available</span>
                      <span className="font-medium text-stone-800">{form.availableFrom}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Storage Status</span>
                      <span className="font-medium text-stone-800">{form.storageAvailable ? "Stored" : "On Farm"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <button type="button" onClick={() => setStep(3)} className="btn-secondary text-xs">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="submit" disabled={saving} className="btn-primary text-xs px-5">
                    {saving ? "Publishing Lot..." : "Publish Produce Lot Now"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Existing Produce Lots Grid */}
      {lots.length === 0 ? (
        <EmptyState 
          message={t("lots.noLotsYet")} 
          submessage="List your harvested or upcoming produce to start receiving competitive bids from verified buyers."
          actionLabel="Create First Lot"
          onAction={() => { setShowWizard(true); setStep(1); }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map((l) => (
            <div key={l.id} className="card p-5 hover:border-brand-300 hover:shadow-card transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-mono text-xs font-bold text-stone-400">#{l.id.slice(-6)}</span>
                  <StatusBadge status={l.status} />
                </div>

                <h3 className="text-base font-bold text-stone-900">{l.crop_name}</h3>
                {l.variety && <p className="text-xs text-stone-500 font-medium">Variety: {l.variety}</p>}

                <div className="grid grid-cols-2 gap-2 my-3 py-2.5 border-y border-stone-100 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">Quantity</span>
                    <span className="font-bold text-stone-900">{l.quantity_quintals} q</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">Quality Grade</span>
                    <span className="font-bold text-brand-700">Grade {l.grade || "A"}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">Expected</span>
                    <span className="font-extrabold text-stone-900">₹{l.expected_price}/q</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">Location</span>
                    <span className="text-stone-700 truncate block">{l.location}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-stone-100">
                <span className="text-[11px] text-stone-400">
                  {l.available_from ? `From ${l.available_from}` : "Ready now"}
                </span>
                <Link to={`/lots/${l.id}`} className="btn-secondary text-xs py-1.5 px-3 font-semibold">
                  {t("lots.viewDetail")} <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
