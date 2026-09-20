import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, EmptyState, StatusBadge, DataBadge } from "../components/ui";
import { 
  CheckCircle2, Circle, Truck, HandCoins, ArrowRight, 
  FileText, ShieldCheck, MapPin, Building2 
} from "lucide-react";

const STAGES = [
  { value: "Deal Accepted", key: "status.dealAccepted" },
  { value: "Invoice Generated", key: "status.invoiceGenerated" },
  { value: "Goods Dispatched", key: "status.goodsDispatched" },
  { value: "Goods Delivered", key: "status.goodsDelivered" },
  { value: "Payment Initiated", key: "status.paymentInitiated" },
  { value: "Payment Received", key: "status.paymentReceived" },
];
const STAGE_VALUES = STAGES.map((s) => s.value);

export default function Transactions() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [txns, setTxns] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  const currentUserId = profile?.user?.id || user?.id;
  const roleProfileId = profile?.roleProfile?.id || currentUserId;

  async function load() {
    if (!roleProfileId && !currentUserId) return;
    const effectiveId = roleProfileId || currentUserId;
    const qs = user?.role === "buyer" ? `buyerId=${effectiveId}` : `farmerOrFpoId=${effectiveId}`;
    let data = await api.get(`/transactions?${qs}`);
    if (Array.isArray(data) && data.length === 0 && currentUserId && currentUserId !== roleProfileId) {
      const fallbackQs = user?.role === "buyer" ? `buyerId=${currentUserId}` : `farmerOrFpoId=${currentUserId}`;
      const fallbackData = await api.get(`/transactions?${fallbackQs}`);
      if (Array.isArray(fallbackData) && fallbackData.length > 0) data = fallbackData;
    }
    setTxns(data || []);
    if (data && data.length > 0 && !selected) {
      openDetail(data[0].id);
    }
  }

  useEffect(() => { 
    if (user) load(); 
    // eslint-disable-next-line
  }, [user, profile]);

  async function openDetail(id: string) {
    const d = await api.get(`/transactions/${id}`);
    setSelected(d);
  }

  async function createLogistics() {
    await api.post(`/transactions/${selected.id}/logistics`, { pickupDate: new Date().toISOString().slice(0, 10) });
    openDetail(selected.id);
  }

  async function advanceLogistics(status: string) {
    await api.patch(`/transactions/${selected.id}/logistics/status`, { 
      status, 
      vehicleNo: status === "Assigned" ? "AP-07-TA-4492" : undefined 
    });
    openDetail(selected.id);
    load();
  }

  async function advancePayment() {
    await api.post(`/transactions/${selected.id}/payments/advance-stage`);
    openDetail(selected.id);
    load();
  }

  return (
    <div className="space-y-5">
      <SectionHeading 
        title={t("transactions.title")} 
        subtitle={t("transactions.subtitle")}
        actions={
          <DataBadge type="LATEST AVAILABLE" note="Audited trade contracts & milestone settlements" />
        }
      />

      <div className="grid md:grid-cols-2 gap-5">
        {/* Transactions List Card */}
        <div className="card p-5">
          <h3 className="font-bold text-sm text-stone-900 mb-3">
            {t("transactions.yourTransactions")} ({txns.length})
          </h3>

          {txns.length === 0 ? (
            <EmptyState message={t("transactions.noTransactions")} />
          ) : (
            <div className="space-y-2.5">
              {txns.map((t2) => {
                const isSelected = selected?.id === t2.id;
                return (
                  <div
                    key={t2.id}
                    onClick={() => openDetail(t2.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? "bg-brand-50/50 border-brand-400 shadow-sm" 
                        : "bg-white border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-brand-700">#{t2.id.slice(-6)}</span>
                      <StatusBadge status={t2.stage} />
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-stone-900">
                      <span>{t2.crop_name}</span>
                      <span>₹{t2.total_amount?.toLocaleString("en-IN")}</span>
                    </div>

                    <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                      <span>{t2.quantity_quintals} q @ ₹{t2.agreed_price}/q</span>
                      <span className="text-stone-400">{t2.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Transaction Details & Stepper */}
        <div className="card p-5">
          {!selected ? (
            <EmptyState message={t("transactions.selectToView")} />
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-stone-400">Deal #{selected.id}</span>
                  <StatusBadge status={selected.stage} />
                </div>
                <h3 className="text-lg font-bold text-stone-900">
                  {selected.crop_name} — {selected.quantity_quintals} Quintals
                </h3>
                <p className="text-xs text-stone-500">
                  Buyer: <span className="font-semibold text-stone-800">{selected.buyer_name}</span> · Contract Total: <span className="font-bold text-brand-700">₹{selected.total_amount?.toLocaleString("en-IN")}</span>
                </p>
              </div>

              {/* Settlement Progress Stepper */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 space-y-2">
                <span className="font-bold text-xs text-dark-muted uppercase tracking-wider block mb-2">
                  Transaction Milestones
                </span>
                {STAGES.map((s, idx) => {
                  const currentIdx = STAGE_VALUES.indexOf(selected.stage);
                  const isDone = idx <= currentIdx;
                  const isCurrent = idx === currentIdx;
                  return (
                    <div key={s.value} className="flex items-center gap-2.5 text-xs">
                      {isDone ? (
                        <CheckCircle2 size={16} className="text-brand-600 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-stone-300 shrink-0" />
                      )}
                      <span className={`${
                        isCurrent 
                          ? "font-bold text-brand-900" 
                          : isDone 
                          ? "font-medium text-stone-800" 
                          : "text-stone-400"
                      }`}>
                        {t(s.key)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Logistics & Dispatch Card */}
              <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Truck size={15} className="text-brand-600" />
                    <span>Transport & Logistics</span>
                  </div>
                  {selected.logistics && (
                    <StatusBadge status={selected.logistics.status} />
                  )}
                </div>

                {!selected.logistics ? (
                  <div className="pt-2">
                    <button onClick={createLogistics} className="btn-primary text-xs w-full">
                      Request Logistics Vehicle
                    </button>
                  </div>
                ) : (
                  <div className="text-xs space-y-1 pt-1">
                    <div className="flex justify-between text-stone-600">
                      <span>Vehicle:</span>
                      <span className="font-semibold text-stone-900">{selected.logistics.vehicle_no || "Assigning..."}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Estimated Freight Cost:</span>
                      <span className="font-semibold text-stone-900">₹{selected.logistics.transport_cost || 450}</span>
                    </div>

                    {selected.logistics.status === "Requested" && (
                      <button onClick={() => advanceLogistics("Assigned")} className="btn-secondary text-xs w-full mt-2">
                        Confirm Vehicle Assignment
                      </button>
                    )}
                    {selected.logistics.status === "Assigned" && (
                      <button onClick={() => advanceLogistics("In Transit")} className="btn-primary text-xs w-full mt-2">
                        Mark In-Transit
                      </button>
                    )}
                    {selected.logistics.status === "In Transit" && (
                      <button onClick={() => advanceLogistics("Delivered")} className="btn-primary text-xs w-full mt-2">
                        Confirm Mandi Delivery
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Settlement Action */}
              {selected.stage !== "Payment Received" && (
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                      <HandCoins size={15} className="text-emerald-700" />
                      Digital Payment Milestone
                    </span>
                    <span className="text-xs font-bold text-emerald-800">₹{selected.total_amount?.toLocaleString("en-IN")}</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Escrow-secured settlement via UPI / RTGS upon weighment slip confirmation.
                  </p>
                  <button onClick={advancePayment} className="btn-primary bg-emerald-700 hover:bg-emerald-800 text-xs w-full mt-1">
                    Advance Payment Settlement
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
