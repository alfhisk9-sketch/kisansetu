import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, StatCard, DemoTag } from "../components/ui";
import { Users, Building2, ShieldCheck, Package, HandCoins, Truck, AlertTriangle, Clock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const COLORS = ["#3d6f2e", "#72ad5f", "#c8952e", "#c3dfb9", "#9cc98c", "#e1efdc"];

export default function AdminDashboard() {
  const { t } = useLocale();
  const [summary, setSummary] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);

  useEffect(() => {
    api.get("/admin/summary").then(setSummary);
    api.get("/admin/charts").then(setCharts);
  }, []);

  if (!summary || !charts) return <div className="text-sm text-stone-400">{t("common.loading")}</div>;

  return (
    <div>
      <SectionHeading title={t("admin.title")} subtitle={t("admin.subtitle")} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t("admin.registeredFarmers")} value={summary.registeredFarmers} icon={<Users size={20} />} />
        <StatCard label={t("admin.activeFpos")} value={summary.activeFpos} icon={<Building2 size={20} />} />
        <StatCard label={t("admin.verifiedBuyers")} value={`${summary.verifiedBuyers}/${summary.totalBuyers}`} icon={<ShieldCheck size={20} />} />
        <StatCard label={t("admin.activeLots")} value={summary.activeLots} icon={<Package size={20} />} />
        <StatCard label={t("admin.openOffers")} value={summary.openOffers} icon={<HandCoins size={20} />} />
        <StatCard label={t("admin.completedTransactions")} value={summary.completedTransactions} sub={`₹${summary.completedTransactionsValue.toLocaleString("en-IN")}`} icon={<Truck size={20} />} />
        <StatCard label={t("admin.openDisputes")} value={summary.openDisputes} icon={<AlertTriangle size={20} />} />
        <StatCard label={t("admin.avgNetRealization")} value={`₹${summary.avgNetRealizationPerQuintal}/q`} icon={<Clock size={20} />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-stone-800">{t("admin.priceTrendTitle")}</h3>
            <DemoTag />
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={charts.priceTrend.map((d: any) => ({ date: d.date.slice(5), price: Math.round(d.avg_price) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="price" stroke="#3d6f2e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("admin.lotsByStatusTitle")}</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={charts.lotsByStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="status" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4f8a3c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("admin.demandByCropTitle")}</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={charts.demandByCrop} dataKey="qty" nameKey="crop" outerRadius={80} label={(d: any) => d.crop}>
                  {charts.demandByCrop.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("admin.txnVolumeTitle")}</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={charts.txnByStage} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 9 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" fill="#c8952e" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 md:col-span-2">
          <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("admin.disputeResolutionTitle")}</h3>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={charts.disputesByStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8a5a2b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
