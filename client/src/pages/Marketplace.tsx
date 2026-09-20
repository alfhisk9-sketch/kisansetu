import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, StatusBadge, EmptyState, DataBadge, Modal } from "../components/ui";
import { 
  ShieldCheck, Plus, Search, Filter, Store, HandCoins, 
  ArrowRight, Building2, MapPin, CheckCircle2, Clock 
} from "lucide-react";

export default function Marketplace() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [crops, setCrops] = useState<any[]>([]);
  const [demands, setDemands] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [openLots, setOpenLots] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"lots" | "demands" | "buyers">("lots");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCropFilter, setSelectedCropFilter] = useState("ALL");

  // Demand creation modal for buyers
  const [showDemandModal, setShowDemandModal] = useState(false);
  const [demandForm, setDemandForm] = useState<any>({ 
    cropId: "", 
    quantityQuintals: 50, 
    gradeRequired: "A", 
    requiredBy: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), 
    offerPrice: 3200, 
    location: profile?.location || "Vijayawada" 
  });

  // Make offer modal
  const [offerModalLot, setOfferModalLot] = useState<any | null>(null);
  const [offerForm, setOfferForm] = useState<any>({ 
    offerPrice: "", 
    quantityQuintals: "", 
    deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), 
    paymentTerms: "Within 48 hours of delivery & weighment" 
  });

  useEffect(() => {
    api.get("/crops").then((data) => { 
      setCrops(data); 
      setDemandForm((f: any) => ({ ...f, cropId: data[0]?.id })); 
    });
    api.get("/buyers/demands/all?status=Open").then(setDemands);
    api.get("/buyers").then(setBuyers);
    api.get("/lots?status=Open for offers").then(setOpenLots);
  }, []);

  async function postDemand(e: React.FormEvent) {
    e.preventDefault();
    const buyerId = profile?.roleProfile?.id || user?.id;
    await api.post("/buyers/demands", { ...demandForm, buyerId });
    setShowDemandModal(false);
    api.get("/buyers/demands/all?status=Open").then(setDemands);
  }

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!offerModalLot) return;
    const buyerId = profile?.roleProfile?.id || user?.id;
    await api.post("/offers", { 
      lotId: offerModalLot.id, 
      buyerId, 
      ...offerForm 
    });
    setOfferModalLot(null);
    api.get("/lots?status=Open for offers").then(setOpenLots);
  }

  // Filtered lists
  const filteredLots = openLots.filter((l) => {
    const matchesCrop = selectedCropFilter === "ALL" || l.crop_id === selectedCropFilter;
    const matchesSearch = !searchQuery || 
      l.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      l.location?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCrop && matchesSearch;
  });

  const filteredDemands = demands.filter((d) => {
    const matchesCrop = selectedCropFilter === "ALL" || d.crop_id === selectedCropFilter;
    const matchesSearch = !searchQuery || 
      d.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.buyer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCrop && matchesSearch;
  });

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("marketplace.title")} 
        subtitle={t("marketplace.subtitle")}
        actions={
          user?.role === "buyer" ? (
            <button className="btn-primary text-xs" onClick={() => setShowDemandModal(true)}>
              <Plus size={16} /> Post Procurement Demand
            </button>
          ) : undefined
        }
      />

      {/* Search & Navigation Tab Bar */}
      <div className="card p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-subtle">
        {/* Filter Tabs */}
        <div className="flex p-1 bg-stone-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("lots")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "lots" 
                ? "bg-white text-stone-900 shadow-sm" 
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Available Lots ({openLots.length})
          </button>
          <button
            onClick={() => setActiveTab("demands")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "demands" 
                ? "bg-white text-stone-900 shadow-sm" 
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Buyer Demands ({demands.length})
          </button>
          <button
            onClick={() => setActiveTab("buyers")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "buyers" 
                ? "bg-white text-stone-900 shadow-sm" 
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Verified Buyers ({buyers.length})
          </button>
        </div>

        {/* Search & Crop Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-52">
            <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
            <input 
              type="text" 
              placeholder="Search produce or city..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs bg-stone-50"
            />
          </div>

          <select 
            value={selectedCropFilter}
            onChange={(e) => setSelectedCropFilter(e.target.value)}
            className="input py-1.5 px-2 text-xs w-auto bg-stone-50"
          >
            <option value="ALL">All Crops</option>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab 1: Available Produce Lots */}
      {activeTab === "lots" && (
        <div>
          {filteredLots.length === 0 ? (
            <EmptyState message="No produce lots match your search." submessage="Try changing the crop filter or location search keyword." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLots.map((l) => (
                <div key={l.id} className="card p-5 hover:shadow-card hover:border-brand-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-stone-400">#{l.id.slice(-6)}</span>
                      <StatusBadge status={l.status} />
                    </div>

                    <h3 className="text-base font-bold text-stone-900">{l.crop_name}</h3>
                    <p className="text-xs text-stone-500">{l.location}, {l.district}</p>

                    <div className="grid grid-cols-2 gap-2 my-3 py-2.5 border-y border-stone-100 text-xs">
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">Quantity</span>
                        <span className="font-bold text-stone-900">{l.quantity_quintals} q</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">Grade</span>
                        <span className="font-bold text-brand-700">Grade {l.grade || "A"}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">Expected Price</span>
                        <span className="font-black text-stone-900">₹{l.expected_price}/q</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px] uppercase">Harvest</span>
                        <span className="text-stone-700 truncate block">{l.harvest_date || "Current"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-stone-100 gap-2">
                    <span className="text-[11px] text-stone-400 capitalize">{l.owner_type || "Farmer"} lot</span>
                    <div className="flex items-center gap-2">
                      <Link to={`/lots/${l.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                        View Details <ArrowRight size={13} />
                      </Link>
                      {user?.role === "buyer" && (
                        <button 
                          onClick={() => {
                            setOfferModalLot(l);
                            setOfferForm({
                              offerPrice: l.expected_price,
                              quantityQuintals: l.quantity_quintals,
                              deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
                              paymentTerms: "Within 48 hours of delivery & weighment"
                            });
                          }}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                        >
                          <HandCoins size={14} /> Make Offer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Buyer Demands */}
      {activeTab === "demands" && (
        <div className="grid sm:grid-cols-2 gap-4">
          {filteredDemands.length === 0 ? (
            <div className="col-span-full">
              <EmptyState message="No open procurement demands found." />
            </div>
          ) : (
            filteredDemands.map((d) => (
              <div key={d.id} className="card p-5 hover:border-brand-300 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-base text-stone-900">{d.crop_name}</span>
                    <span className="text-base font-black text-brand-700">₹{d.offer_price}/q</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-stone-600 mb-3">
                    <Building2 size={13} className="text-stone-400" />
                    <span className="font-semibold text-stone-800">{d.buyer_name}</span>
                    <span className="badge bg-stone-100 text-stone-700 border-stone-200">
                      {d.buyer_type}
                    </span>
                    {d.verified && (
                      <span className="text-brand-600 flex items-center gap-0.5 text-[11px] font-bold">
                        <ShieldCheck size={13} /> Verified
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-stone-100 text-xs">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Target Qty</span>
                      <span className="font-bold text-stone-800">{d.quantity_quintals} q</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Grade Needed</span>
                      <span className="font-bold text-brand-700">Grade {d.grade_required}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase">Needed By</span>
                      <span className="text-stone-700">{d.required_by}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between text-xs">
                  <span className="text-stone-400 flex items-center gap-1 text-[11px]">
                    <MapPin size={12} /> {d.location}
                  </span>
                  <span className="badge bg-emerald-50 text-emerald-700 border-emerald-200">
                    Open for Supply
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Verified Buyers Directory */}
      {activeTab === "buyers" && (
        <div className="card overflow-hidden shadow-subtle">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Buyer / Enterprise</th>
                  <th>Enterprise Type</th>
                  <th>Location</th>
                  <th>Verification Status</th>
                  <th>Completed Deals</th>
                  <th>Payment Reliability</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="font-bold text-stone-900">{b.name}</div>
                      <div className="text-xs text-stone-400">{b.contact}</div>
                    </td>
                    <td>
                      <span className="badge bg-stone-100 text-stone-700 border-stone-200">
                        {b.buyer_type}
                      </span>
                    </td>
                    <td>{b.location}</td>
                    <td>
                      {b.verified ? (
                        <span className="text-brand-700 font-semibold flex items-center gap-1 text-xs">
                          <ShieldCheck size={14} className="text-brand-600" /> Verified Entity
                        </span>
                      ) : (
                        <span className="text-stone-400 text-xs">Pending Documents</span>
                      )}
                    </td>
                    <td className="font-bold text-stone-800">{b.transactions_completed}</td>
                    <td>
                      <span className="font-black text-brand-700">{b.payment_reliability_pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Post Demand Modal for Buyers */}
      <Modal
        isOpen={showDemandModal}
        onClose={() => setShowDemandModal(false)}
        title="Post Procurement Demand"
      >
        <form onSubmit={postDemand} className="space-y-3.5 text-xs">
          <div>
            <label className="field-label">Crop Required</label>
            <select 
              className="input" 
              value={demandForm.cropId} 
              onChange={(e) => setDemandForm({ ...demandForm, cropId: e.target.value })}
            >
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Quantity (Quintals)</label>
              <input 
                className="input" 
                type="number" 
                min={1}
                value={demandForm.quantityQuintals} 
                onChange={(e) => setDemandForm({ ...demandForm, quantityQuintals: Number(e.target.value) })} 
                required 
              />
            </div>
            <div>
              <label className="field-label">Minimum Quality Grade</label>
              <select 
                className="input" 
                value={demandForm.gradeRequired} 
                onChange={(e) => setDemandForm({ ...demandForm, gradeRequired: e.target.value })}
              >
                <option>A</option>
                <option>B</option>
                <option>C</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Offer Price (₹ / quintal)</label>
              <input 
                className="input font-bold text-brand-700" 
                type="number" 
                value={demandForm.offerPrice} 
                onChange={(e) => setDemandForm({ ...demandForm, offerPrice: Number(e.target.value) })} 
                required 
              />
            </div>
            <div>
              <label className="field-label">Required By Date</label>
              <input 
                className="input" 
                type="date" 
                value={demandForm.requiredBy} 
                onChange={(e) => setDemandForm({ ...demandForm, requiredBy: e.target.value })} 
                required 
              />
            </div>
          </div>
          <div>
            <label className="field-label">Delivery Destination</label>
            <input 
              className="input" 
              value={demandForm.location} 
              onChange={(e) => setDemandForm({ ...demandForm, location: e.target.value })} 
              required 
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowDemandModal(false)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Publish Procurement Demand
            </button>
          </div>
        </form>
      </Modal>

      {/* Make Offer Modal for Buyers */}
      <Modal
        isOpen={Boolean(offerModalLot)}
        onClose={() => setOfferModalLot(null)}
        title={`Make Direct Offer on Lot #${offerModalLot?.id?.slice(-6)}`}
      >
        <form onSubmit={submitOffer} className="space-y-3.5 text-xs">
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
            <div className="font-bold text-stone-800">{offerModalLot?.crop_name} — {offerModalLot?.quantity_quintals} Quintals (Grade {offerModalLot?.grade})</div>
            <div className="text-[11px] text-stone-500 mt-0.5">Farmer Expected: ₹{offerModalLot?.expected_price}/q · Location: {offerModalLot?.location}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Your Bid Price (₹ / q)</label>
              <input 
                className="input font-bold text-brand-700 text-sm" 
                type="number" 
                placeholder="₹ Offer Price" 
                value={offerForm.offerPrice} 
                onChange={(e) => setOfferForm({ ...offerForm, offerPrice: Number(e.target.value) })} 
                required 
              />
            </div>
            <div>
              <label className="field-label">Quantity to Purchase (q)</label>
              <input 
                className="input text-sm" 
                type="number" 
                placeholder="Quantity" 
                value={offerForm.quantityQuintals} 
                onChange={(e) => setOfferForm({ ...offerForm, quantityQuintals: Number(e.target.value) })} 
                required 
              />
            </div>
          </div>

          <div>
            <label className="field-label">Requested Delivery Date</label>
            <input 
              className="input" 
              type="date" 
              value={offerForm.deliveryDate} 
              onChange={(e) => setOfferForm({ ...offerForm, deliveryDate: e.target.value })} 
              required 
            />
          </div>

          <div>
            <label className="field-label">Payment Terms</label>
            <input 
              className="input" 
              value={offerForm.paymentTerms} 
              onChange={(e) => setOfferForm({ ...offerForm, paymentTerms: e.target.value })} 
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOfferModalLot(null)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Submit Binding Offer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
