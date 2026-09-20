import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, EmptyState, StatusBadge } from "../components/ui";
import { Plus } from "lucide-react";

const CATEGORIES = [
  { value: "Quality dispute", key: "category.qualityDispute" },
  { value: "Quantity dispute", key: "category.quantityDispute" },
  { value: "Payment delay", key: "category.paymentDelay" },
  { value: "Logistics issue", key: "category.logisticsIssue" },
  { value: "Buyer issue", key: "category.buyerIssue" },
  { value: "Other", key: "category.other" },
];
const CATEGORY_KEY: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.key]));

const STATUSES = [
  { value: "Submitted", key: "status.submitted" },
  { value: "Under Review", key: "status.underReview" },
  { value: "Evidence Requested", key: "status.evidenceRequested" },
  { value: "Resolved", key: "status.resolved" },
  { value: "Rejected", key: "status.rejected" },
];

export default function Grievances() {
  const { user, profile } = useAuth();
  const { t } = useLocale();
  const [grievances, setGrievances] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ transactionId: "", issueCategory: "Payment delay", description: "" });

  const currentUserId = profile?.user?.id || user?.id;
  const roleProfileId = profile?.roleProfile?.id || currentUserId;

  async function load() {
    if (user?.role === "admin") {
      setGrievances(await api.get("/grievances"));
    } else {
      if (!currentUserId) return;
      setGrievances(await api.get(`/grievances?raisedBy=${currentUserId}`));
      const qs = user?.role === "buyer" ? `buyerId=${roleProfileId}` : `farmerOrFpoId=${roleProfileId}`;
      setTxns(await api.get(`/transactions?${qs}`));
    }
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user, profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description?.trim()) {
      alert("Description cannot be empty");
      return;
    }
    if (!currentUserId) {
      alert("User session not found");
      return;
    }
    await api.post("/grievances", { ...form, description: form.description.trim(), raisedBy: currentUserId });
    setShowForm(false);
    setForm({ transactionId: "", issueCategory: "Payment delay", description: "" });
    load();
  }

  async function updateStatus(id: string, status: string) {
    const notes = status === "Resolved" ? prompt(t("grievances.resolutionNotesPrompt")) || undefined : undefined;
    await api.patch(`/grievances/${id}`, { status, resolutionNotes: notes });
    load();
  }

  return (
    <div>
      <SectionHeading title={t("grievances.title")} subtitle={t("grievances.subtitle")} />

      {user?.role !== "admin" && (
        <div className="mb-4">
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> {showForm ? t("common.cancel") : t("grievances.raiseGrievance")}
          </button>
          {showForm && (
            <form onSubmit={submit} className="card p-4 mt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t("grievances.transaction")}</label>
                <select className="input" value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })} required>
                  <option value="">{t("grievances.selectTransaction")}</option>
                  {txns.map((t2) => <option key={t2.id} value={t2.id}>{t2.id} — {t2.crop_name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">{t("grievances.issueCategory")}</label>
                <select className="input" value={form.issueCategory} onChange={(e) => setForm({ ...form, issueCategory: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.key)}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">{t("grievances.description")}</label>
                <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div className="sm:col-span-2"><button className="btn-primary">{t("grievances.submitGrievance")}</button></div>
            </form>
          )}
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        {grievances.length === 0 ? <EmptyState message={t("grievances.noGrievances")} /> : (
          <table className="data-table min-w-[720px]">
            <thead><tr><th>{t("grievances.tableId")}</th><th>{t("grievances.tableTransaction")}</th><th>{t("grievances.tableCategory")}</th><th>{t("grievances.tableDescription")}</th><th>{t("grievances.tableStatus")}</th>{user?.role === "admin" && <th>{t("grievances.tableUpdate")}</th>}</tr></thead>
            <tbody>
              {grievances.map((g: any) => (
                <tr key={g.id}>
                  <td className="font-mono text-xs">{g.id}</td>
                  <td className="font-mono text-xs">{g.transaction_id}</td>
                  <td>{CATEGORY_KEY[g.issue_category] ? t(CATEGORY_KEY[g.issue_category]) : g.issue_category}</td>
                  <td className="max-w-xs">{g.description}{g.resolution_notes && <div className="text-xs text-brand-600 mt-1">{t("grievances.resolution", { notes: g.resolution_notes })}</div>}</td>
                  <td><StatusBadge status={g.status} /></td>
                  {user?.role === "admin" && (
                    <td>
                      <select className="input text-xs" value={g.status} onChange={(e) => updateStatus(g.id, e.target.value)}>
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{t(s.key)}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
