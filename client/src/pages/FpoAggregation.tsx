import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, EmptyState, StatusBadge, DemoTag, StatCard } from "../components/ui";
import { Users, Package, Layers } from "lucide-react";

export default function FpoAggregation() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [data, setData] = useState<any>(null);
  const [crops, setCrops] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<any>({ cropId: "", grade: "A", location: "", district: "Guntur", expectedPrice: "", minAcceptablePrice: "", harvestDate: "", availableFrom: "" });
  const [showForm, setShowForm] = useState(false);

  async function load() {
    if (!profile?.id) return;
    const d = await api.get(`/fpo/${profile.id}/aggregation`);
    setData(d);
  }

  useEffect(() => {
    api.get("/crops").then(setCrops);
    load();
    // eslint-disable-next-line
  }, [profile]);

  function toggleLot(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function createAggregate(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) return;
    await api.post(`/fpo/${profile.id}/aggregate-lot`, { sourceLotIds: selected, ...form });
    setSelected([]);
    setShowForm(false);
    load();
  }

  if (!data) return <div className="text-sm text-stone-400">{t("common.loading")}</div>;

  const openLots = data.individualLots.filter((l: any) => l.status === "Open for offers");

  return (
    <div>
      <SectionHeading title={t("fpo.title")} subtitle={t("fpo.subtitle", { name: data.fpo.name })} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label={t("fpo.memberFarmers")} value={data.memberFarmerCount} icon={<Users size={20} />} />
        <StatCard label={t("fpo.totalAvailable")} value={data.totalAvailableQuintals} icon={<Package size={20} />} />
        <StatCard label={t("fpo.aggregatedLots")} value={data.aggregatedLots.length} icon={<Layers size={20} />} />
      </div>

      <div className="card p-4 mb-4 overflow-x-auto">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-stone-800">{t("fpo.breakdownTitle")}</h3>
          <DemoTag />
        </div>
        {data.breakdownByCropAndGrade.length === 0 ? <EmptyState message={t("fpo.noSupply")} /> : (
          <table className="data-table">
            <thead><tr><th>{t("common.fields.crop")}</th><th>{t("lots.tableGrade")}</th><th>{t("fpo.tableQuantity")}</th></tr></thead>
            <tbody>
              {data.breakdownByCropAndGrade.map((b: any, i: number) => (
                <tr key={i}><td>{b.crop}</td><td>{b.grade}</td><td>{b.quantityQuintals}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-4 mb-4 overflow-x-auto">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-stone-800">{t("fpo.selectLotsTitle")}</h3>
          <button className="btn-primary text-xs" disabled={selected.length === 0} onClick={() => setShowForm(true)}>
            {t("fpo.createAggregateLot", { count: selected.length })}
          </button>
        </div>
        {openLots.length === 0 ? <EmptyState message={t("fpo.noOpenLots")} /> : (
          <table className="data-table">
            <thead><tr><th></th><th>{t("fpo.tableLot")}</th><th>{t("common.fields.crop")}</th><th>{t("fpo.tableQuantity")}</th><th>{t("lots.tableGrade")}</th><th>{t("fpo.tableStatus")}</th></tr></thead>
            <tbody>
              {openLots.map((l: any) => (
                <tr key={l.id}>
                  <td><input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggleLot(l.id)} /></td>
                  <td className="font-mono text-xs">{l.id}</td>
                  <td>{l.crop_name}</td>
                  <td>{l.quantity_quintals}</td>
                  <td>{l.grade}</td>
                  <td><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <form onSubmit={createAggregate} className="card p-4 mb-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="field-label">{t("common.fields.crop")}</label>
            <select className="input" value={form.cropId} onChange={(e) => setForm({ ...form, cropId: e.target.value })} required>
              <option value="">{t("fpo.selectPlaceholder")}</option>
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t("lots.tableGrade")}</label>
            <select className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}><option>A</option><option>B</option><option>C</option></select></div>
          <div><label className="field-label">{t("common.fields.location")}</label>
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></div>
          <div><label className="field-label">{t("common.fields.district")}</label>
            <input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} required /></div>
          <div><label className="field-label">{t("fpo.expectedPrice")}</label>
            <input className="input" type="number" value={form.expectedPrice} onChange={(e) => setForm({ ...form, expectedPrice: Number(e.target.value) })} /></div>
          <div><label className="field-label">{t("fpo.minAcceptable")}</label>
            <input className="input" type="number" value={form.minAcceptablePrice} onChange={(e) => setForm({ ...form, minAcceptablePrice: Number(e.target.value) })} /></div>
          <div className="md:col-span-3 flex gap-2">
            <button className="btn-primary">{t("fpo.confirmAggregateLot")}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("fpo.aggregatedReadyTitle")}</h3>
        {data.aggregatedLots.length === 0 ? <EmptyState message={t("fpo.noAggregated")} /> : (
          <table className="data-table">
            <thead><tr><th>{t("fpo.tableLot")}</th><th>{t("common.fields.crop")}</th><th>{t("fpo.tableQuantity")}</th><th>{t("lots.tableGrade")}</th><th>{t("fpo.tableStatus")}</th></tr></thead>
            <tbody>
              {data.aggregatedLots.map((l: any) => (
                <tr key={l.id}>
                  <td className="font-mono text-xs">{l.id}</td>
                  <td>{l.crop_name}</td>
                  <td>{l.quantity_quintals}</td>
                  <td>{l.grade}</td>
                  <td><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
