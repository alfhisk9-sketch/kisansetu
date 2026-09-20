import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { 
  SectionHeading, StatCard, StatusBadge, EmptyState, DataBadge, 
  NetRealizationCard, SkeletonCard 
} from "../components/ui";
import { 
  Package, HandCoins, Truck, TrendingUp, Sparkles, 
  ArrowRight, ShieldCheck, MapPin, CheckCircle2, Award
} from "lucide-react";

const ROLE_KEY: Record<string, string> = {
  farmer: "common.roles.farmer",
  fpo: "common.roles.fpo",
  buyer: "common.roles.buyer",
  admin: "common.roles.admin",
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [lots, setLots] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [demands, setDemands] = useState<any[]>([]);
  const [bestMarket, setBestMarket] = useState<any>(null);
  const [crops, setCrops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const cropsData = await api.get("/crops");
        setCrops(cropsData);

        const currentUserId = profile?.user?.id || user?.id;
        const roleProfileId = profile?.roleProfile?.id || currentUserId;

        if (user?.role === "farmer" || user?.role === "fpo") {
          let lotsData = await api.get(`/lots?ownerId=${roleProfileId}&ownerType=${user.role}`);
          if (Array.isArray(lotsData) && lotsData.length === 0 && currentUserId && currentUserId !== roleProfileId) {
            const fallbackLots = await api.get(`/lots?ownerId=${currentUserId}&ownerType=${user.role}`);
            if (Array.isArray(fallbackLots) && fallbackLots.length > 0) lotsData = fallbackLots;
          }
          setLots(lotsData || []);

          let txnsData = await api.get(`/transactions?farmerOrFpoId=${roleProfileId}`);
          if (Array.isArray(txnsData) && txnsData.length === 0 && currentUserId && currentUserId !== roleProfileId) {
            const fallbackTxns = await api.get(`/transactions?farmerOrFpoId=${currentUserId}`);
            if (Array.isArray(fallbackTxns) && fallbackTxns.length > 0) txnsData = fallbackTxns;
          }
          setTxns(txnsData || []);

          if (lotsData && lotsData.length > 0) {
            const offersAll = await Promise.all(
              lotsData.slice(0, 5).map((l: any) => api.get(`/offers?lotId=${l.id}`))
            );
            setOffers(offersAll.flat());
          }

          // Fetch best market recommendation for user's primary crop
          const primaryCrop = lotsData?.[0]?.crop_id || cropsData?.[0]?.id;
          const userDistrict = profile?.roleProfile?.district || profile?.district || user.location?.split(",")?.[1]?.trim() || "Guntur";
          if (primaryCrop) {
            try {
              const comp = await api.get(`/markets/compare?cropId=${primaryCrop}&district=${userDistrict}&quantity=10&grade=A`);
              if (comp.options && comp.options.length > 0) {
                setBestMarket({
                  ...comp.options[0],
                  cropName: cropsData.find((c: any) => c.id === primaryCrop)?.name || "Chilli/Onion"
                });
              }
            } catch (err) {
              console.warn("Best market recommendation load failed:", err);
            }
          }
        } else if (user?.role === "buyer") {
          try {
            const demandData = await api.get(`/buyers/${roleProfileId}`);
            setDemands(demandData.demands || []);
          } catch (_) {
            setDemands([]);
          }
          const txnsData = await api.get(`/transactions?buyerId=${roleProfileId}`);
          setTxns(txnsData || []);
        }
      } catch (e) {
        console.error("Dashboard data load error:", e);
      } finally {
        setLoading(false);
      }
    }
    if (user) load();
  }, [user, profile]);

  if (!user) return null;

  // Calculate highest available offer price
  const highestOffer = offers.length > 0 
    ? Math.max(...offers.map((o: any) => o.offer_price || 0)) 
    : (bestMarket?.modalPrice || 0);

  const completedSalesVal = txns
    .filter((t: any) => t.stage === "Payment Received")
    .reduce((sum: number, t: any) => sum + (t.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Welcome & Role Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-stone-200/80 shadow-subtle">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200/60">
              {t(ROLE_KEY[user.role] || "common.roles.farmer")}
            </span>
            <DataBadge type="LATEST AVAILABLE" note="Platform ledger state" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 mt-1">
            {t("dashboard.welcome", { name: user.display_name })}
          </h1>
          <p className="text-xs text-dark-muted flex items-center gap-1.5 mt-0.5">
            <MapPin size={13} className="text-stone-400" />
            <span>{user.location || "Andhra Pradesh"}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link to="/assistant" className="btn-secondary text-xs">
            <Sparkles size={14} className="text-amber-500" />
            Ask AI Saathi
          </Link>
          {(user.role === "farmer" || user.role === "fpo") && (
            <Link to="/lots" className="btn-primary text-xs">
              List Produce
            </Link>
          )}
        </div>
      </div>

      {/* Hero Banner: Sell Smarter, Earn Better */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-800 via-brand-700 to-emerald-800 text-white p-6 shadow-elevated">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full text-accent-300 mb-2">
            <Sparkles size={13} /> Digital Price Discovery
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Sell smarter. Earn better.</h2>
          <p className="text-xs sm:text-sm text-brand-100 mt-1.5 leading-relaxed">
            Never sell below true market value. KisanSetu automatically deducts road logistics and mandi charges to reveal your highest take-home net realization across all regional mandis.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/compare" className="btn-accent text-xs">
              Compare Mandis Now <ArrowRight size={14} />
            </Link>
            <Link to="/market-intelligence" className="btn bg-white/10 hover:bg-white/20 text-white text-xs border border-white/20">
              Check Daily Arrivals
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(user.role === "farmer" || user.role === "fpo") ? (
            <>
              <StatCard 
                label={t("dashboard.activeLots")} 
                value={lots.filter((l) => ["Open for offers", "Under negotiation"].includes(l.status)).length} 
                sub={`${lots.reduce((s, l) => s + (l.quantity_quintals || 0), 0)} quintals total`}
                icon={<Package size={22} />} 
              />
              <StatCard 
                label="Best In-Hand Price" 
                value={`₹${highestOffer || 0}`} 
                sub="per quintal"
                trend="+8.5% this week"
                trendPositive={true}
                icon={<Award size={22} />} 
              />
              <StatCard 
                label={t("dashboard.pendingOffers")} 
                value={offers.filter((o) => o.status === "Pending").length} 
                sub="Direct buyer bids"
                icon={<HandCoins size={22} />} 
              />
              <StatCard 
                label="Completed Sales" 
                value={`₹${completedSalesVal.toLocaleString("en-IN")}`} 
                sub={`${txns.filter((t) => t.stage === "Payment Received").length} settlements`}
                icon={<Truck size={22} />} 
              />
            </>
          ) : user.role === "buyer" ? (
            <>
              <StatCard 
                label={t("dashboard.openDemandPosts")} 
                value={demands.filter((d: any) => d.status === "Open").length} 
                icon={<Package size={22} />} 
              />
              <StatCard 
                label="Active Contracts" 
                value={txns.filter((t: any) => t.stage !== "Payment Received").length} 
                icon={<Truck size={22} />} 
              />
              <StatCard 
                label="Completed Purchases" 
                value={txns.filter((t: any) => t.stage === "Payment Received").length} 
                icon={<HandCoins size={22} />} 
              />
              <StatCard 
                label="Verified Rating" 
                value="98.5%" 
                sub="Payment reliability"
                icon={<ShieldCheck size={22} />} 
              />
            </>
          ) : (
            <div className="col-span-full">
              <Link to="/admin" className="btn-primary">Go to Admin Portal</Link>
            </div>
          )}
        </div>
      )}

      {/* Best Market Today Highlight */}
      {bestMarket && (
        <div className="card p-5 bg-gradient-to-br from-emerald-50/50 via-white to-brand-50/30 border-brand-300/80 shadow-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                ★ Best Market Today for {bestMarket.cropName}
              </span>
              <h3 className="text-base font-bold text-stone-900 mt-1">
                {bestMarket.marketName} ({bestMarket.district})
              </h3>
            </div>
            <Link to="/compare" className="text-xs font-bold text-brand-700 hover:text-brand-900 flex items-center gap-1">
              View All 10 Mandis <ArrowRight size={13} />
            </Link>
          </div>

          <NetRealizationCard 
            salePrice={bestMarket.modalPrice}
            transportCost={bestMarket.transportCostPerQuintal}
            marketCharges={Math.round(bestMarket.modalPrice * 0.03 + 10)}
            netRealization={bestMarket.netRealization}
          />
        </div>
      )}

      {/* Farmer Dashboard Tables */}
      {(user.role === "farmer" || user.role === "fpo") && (
        <div className="grid md:grid-cols-2 gap-5">
          {/* Active Lots Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-stone-900">{t("dashboard.yourLots")}</h3>
                <p className="text-xs text-stone-500">Currently listed produce lots</p>
              </div>
              <Link to="/lots" className="btn-secondary text-xs py-1.5">
                {t("dashboard.manageLots")}
              </Link>
            </div>

            {lots.length === 0 ? (
              <EmptyState 
                message={t("dashboard.noLotsYet")} 
                actionLabel="Create First Lot" 
                onAction={() => window.location.href = "/lots"} 
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lot #</th>
                      <th>{t("dashboard.crop")}</th>
                      <th>Qty (q)</th>
                      <th>{t("dashboard.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.slice(0, 5).map((l) => (
                      <tr key={l.id}>
                        <td className="font-mono text-xs font-semibold text-brand-700">
                          <Link to={`/lots/${l.id}`} className="hover:underline">
                            #{l.id.slice(-6)}
                          </Link>
                        </td>
                        <td className="font-medium text-stone-900">{l.crop_name}</td>
                        <td className="font-semibold text-stone-800">{l.quantity_quintals}</td>
                        <td><StatusBadge status={l.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Offers Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-stone-900">{t("dashboard.recentOffers")}</h3>
                <p className="text-xs text-stone-500">Bids from verified traders</p>
              </div>
              <Link to="/marketplace" className="btn-secondary text-xs py-1.5">
                {t("dashboard.viewMarketplace")}
              </Link>
            </div>

            {offers.length === 0 ? (
              <EmptyState 
                message={t("dashboard.noOffersYet")} 
                submessage="Buyer offers on your listed lots will appear here automatically." 
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lot #</th>
                      <th>Offer / q</th>
                      <th>{t("dashboard.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.slice(0, 5).map((o) => (
                      <tr key={o.id}>
                        <td className="font-mono text-xs text-stone-600">
                          <Link to={`/lots/${o.lot_id}`} className="hover:underline">
                            #{o.lot_id?.slice(-6)}
                          </Link>
                        </td>
                        <td className="font-bold text-brand-700">₹{o.offer_price}</td>
                        <td><StatusBadge status={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buyer Dashboard View */}
      {user.role === "buyer" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm text-stone-900">{t("dashboard.yourDemandPosts")}</h3>
              <p className="text-xs text-stone-500">Procurement requirements open for farmers</p>
            </div>
            <Link to="/marketplace" className="btn-primary text-xs py-1.5">
              Post New Demand
            </Link>
          </div>

          {demands.length === 0 ? (
            <EmptyState message={t("dashboard.noDemandYet")} actionLabel="Post Produce Demand" onAction={() => window.location.href = "/marketplace"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Demand ID</th>
                    <th>Crop</th>
                    <th>Required (q)</th>
                    <th>Offer Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {demands.map((d: any) => (
                    <tr key={d.id}>
                      <td className="font-mono text-xs font-semibold text-brand-700">#{d.id.slice(-6)}</td>
                      <td className="font-medium text-stone-900">{d.crop_name}</td>
                      <td className="font-semibold text-stone-800">{d.quantity_quintals}</td>
                      <td className="font-bold text-stone-900">₹{d.offer_price}/q</td>
                      <td><StatusBadge status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
