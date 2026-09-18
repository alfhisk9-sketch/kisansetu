import { ReactNode } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { 
  CheckCircle2, Clock, AlertCircle, HelpCircle, X, 
  TrendingUp, TrendingDown, ArrowRight, ShieldCheck, Sparkles, Inbox
} from "lucide-react";

// Status to i18n mapping
const STATUS_I18N_KEY: Record<string, string> = {
  "Open for offers": "status.openForOffers",
  "Under negotiation": "status.underNegotiation",
  Sold: "status.sold",
  Closed: "status.closed",
  Withdrawn: "status.withdrawn",
  Open: "status.open",
  Fulfilled: "status.fulfilled",
  Pending: "status.pending",
  Accepted: "status.accepted",
  Rejected: "status.rejected",
  Countered: "status.countered",
  Expired: "status.expired",
  Cancelled: "status.cancelled",
  "Deal Accepted": "status.dealAccepted",
  "Invoice Generated": "status.invoiceGenerated",
  "Goods Dispatched": "status.goodsDispatched",
  "Goods Delivered": "status.goodsDelivered",
  "Payment Initiated": "status.paymentInitiated",
  "Payment Received": "status.paymentReceived",
  Requested: "status.requested",
  Assigned: "status.assigned",
  "In Transit": "status.inTransit",
  Delivered: "status.delivered",
  Received: "status.received",
  Initiated: "status.initiated",
  Delayed: "status.delayed",
  Submitted: "status.submitted",
  "Under Review": "status.underReview",
  "Evidence Requested": "status.evidenceRequested",
  Resolved: "status.resolved",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const map: Record<string, { cls: string; icon?: ReactNode }> = {
    "Open for offers": { cls: "bg-brand-50 text-brand-700 border-brand-200", icon: <CheckCircle2 size={12} /> },
    "Under negotiation": { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock size={12} /> },
    Sold: { cls: "bg-stone-100 text-stone-700 border-stone-200", icon: <CheckCircle2 size={12} /> },
    Closed: { cls: "bg-stone-100 text-stone-500 border-stone-200" },
    Withdrawn: { cls: "bg-stone-100 text-stone-500 border-stone-200" },
    Pending: { cls: "bg-amber-50 text-amber-800 border-amber-200", icon: <Clock size={12} /> },
    Accepted: { cls: "bg-brand-50 text-brand-700 border-brand-200", icon: <CheckCircle2 size={12} /> },
    Rejected: { cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertCircle size={12} /> },
    Countered: { cls: "bg-sky-50 text-sky-800 border-sky-200" },
    Expired: { cls: "bg-stone-100 text-stone-500 border-stone-200" },
    Requested: { cls: "bg-amber-50 text-amber-800 border-amber-200" },
    Assigned: { cls: "bg-sky-50 text-sky-800 border-sky-200" },
    "In Transit": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    Delivered: { cls: "bg-brand-50 text-brand-700 border-brand-200", icon: <CheckCircle2 size={12} /> },
    Received: { cls: "bg-brand-50 text-brand-700 border-brand-200" },
    Initiated: { cls: "bg-sky-50 text-sky-800 border-sky-200" },
    Delayed: { cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertCircle size={12} /> },
    Submitted: { cls: "bg-amber-50 text-amber-800 border-amber-200" },
    "Under Review": { cls: "bg-sky-50 text-sky-800 border-sky-200" },
    "Evidence Requested": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    Resolved: { cls: "bg-brand-50 text-brand-700 border-brand-200", icon: <CheckCircle2 size={12} /> },
    Open: { cls: "bg-brand-50 text-brand-700 border-brand-200" },
    Fulfilled: { cls: "bg-stone-100 text-stone-700 border-stone-200" },
  };

  const key = STATUS_I18N_KEY[status];
  const label = key ? t(key) : status;
  const config = map[status] || { cls: "bg-stone-100 text-stone-600 border-stone-200" };

  return (
    <span className={`badge ${config.cls}`}>
      {config.icon}
      {label}
    </span>
  );
}

/**
 * Honest Data Indicator
 * Clearly separates Verified Live data from Seeded / Estimates / Forecasts
 */
export function DataBadge({ type = "UPDATED", note }: { type?: "LIVE" | "UPDATED" | "ESTIMATED" | "FORECAST" | "SEEDED"; note?: string }) {
  const styles: Record<string, string> = {
    LIVE: "bg-emerald-50 text-emerald-700 border-emerald-300",
    UPDATED: "bg-sky-50 text-sky-700 border-sky-200",
    ESTIMATED: "bg-amber-50 text-amber-700 border-amber-200",
    FORECAST: "bg-indigo-50 text-indigo-700 border-indigo-200",
    SEEDED: "bg-stone-100 text-stone-600 border-stone-200",
  };

  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${styles[type] || styles.UPDATED}`}
      title={note || `${type} data from platform`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {type}
    </span>
  );
}

export function StatCard({ 
  label, 
  value, 
  sub, 
  icon,
  trend,
  trendPositive
}: { 
  label: string; 
  value: ReactNode; 
  sub?: string; 
  icon?: ReactNode;
  trend?: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="card p-4 hover:border-brand-300 hover:shadow-card transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-dark-muted uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold text-dark-text mt-1.5 tracking-tight">{value}</div>
          {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${trendPositive ? "text-emerald-600" : "text-red-600"}`}>
              {trendPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              <span>{trend}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-brand-50 text-brand-700 border border-brand-100">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 sm:w-36 shrink-0 text-stone-600 font-medium truncate">{label}</div>
      <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-brand-600 h-2 rounded-full transition-all duration-500" 
          style={{ width: `${pct}%` }} 
        />
      </div>
      <div className="w-8 text-right font-bold text-stone-800">{value}</div>
    </div>
  );
}

export function SectionHeading({ 
  title, 
  subtitle,
  actions
}: { 
  title: string; 
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-dark-text tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-dark-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ 
  message, 
  submessage,
  actionLabel, 
  onAction 
}: { 
  message: string; 
  submessage?: string;
  actionLabel?: string; 
  onAction?: () => void;
}) {
  return (
    <div className="card p-8 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mb-3">
        <Inbox size={24} />
      </div>
      <p className="text-sm font-semibold text-stone-700">{message}</p>
      {submessage && <p className="text-xs text-stone-500 mt-1 max-w-sm">{submessage}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mt-4 text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function DemoTag() {
  const { t } = useLocale();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Sparkles size={11} />
      {t("common.demoData")}
    </span>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse bg-stone-200 rounded ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/**
 * Accessible Modal Dialog
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden z-10 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-base text-dark-text">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Transparent Net Realization Formula Display Card
 */
export function NetRealizationCard({
  salePrice,
  transportCost,
  marketCharges = 0,
  storageCost = 0,
  netRealization,
  unit = "quintal"
}: {
  salePrice: number;
  transportCost: number;
  marketCharges?: number;
  storageCost?: number;
  netRealization: number;
  unit?: string;
}) {
  return (
    <div className="bg-brand-50/60 border border-brand-200/80 rounded-xl p-3.5 text-xs text-stone-700">
      <div className="flex items-center justify-between font-semibold text-brand-900 mb-2">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-brand-600" />
          Net Realization Formula
        </span>
        <span className="text-sm font-bold text-brand-700">₹{netRealization}/{unit}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-brand-200/60 text-[11px]">
        <div>
          <span className="text-stone-500 block">Headline Price</span>
          <span className="font-semibold text-stone-900">₹{salePrice}</span>
        </div>
        <div>
          <span className="text-stone-500 block">- Transport</span>
          <span className="font-semibold text-red-600">₹{transportCost}</span>
        </div>
        <div>
          <span className="text-stone-500 block">- Mandi Charges</span>
          <span className="font-semibold text-stone-800">₹{marketCharges}</span>
        </div>
        <div>
          <span className="text-stone-500 block">= Net In-Hand</span>
          <span className="font-bold text-brand-700">₹{netRealization}</span>
        </div>
      </div>
    </div>
  );
}
