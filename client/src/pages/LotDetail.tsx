import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, StatusBadge, EmptyState, ScoreBar } from "../components/ui";
import { BuyerMatch } from "../lib/types";

// Raw quality-rating enum values (contract-defined, stored as-is in the DB)
// mapped to their i18n key suffix — same pattern as STATUS_I18N_KEY in ui.tsx.
const RATING_I18N_KEY: Record<string, string> = {
  Good: "common.ratings.good",
  Average: "common.ratings.average",
  Poor: "common.ratings.poor",
  Acceptable: "common.ratings.acceptable",
};

export default function LotDetail() {
  const { id } = useParams();
  const { t } = useLocale();
  const [lot, setLot] = useState<any>(null);
  const [matches, setMatches] = useState<BuyerMatch[]>([]);
  const [storageOptions, setStorageOptions] = useState<any[]>([]);
  const [storageResult, setStorageResult] = useState<any>(null);
  const [storageId, setStorageId] = useState("");
  const [storageDays, setStorageDays] = useState(14);
  const [gradeForm, setGradeForm] = useState({ sizeRating: "Good", moistureRating: "Good", damagePct: 3, foreignMaterialPct: 1, appearanceRating: "Good" });
  const [counterState, setCounterState] = useState<Record<string, { price: string; note: string }>>({});

  async function load() {
    const data = await api.get(`/lots/${id}`);
    setLot(data);
  }

  useEffect(() => { load(); api.get(`/buyers/match/for-lot/${id}`).then((d) => setMatches(d.matches || [])); api.get("/storage").then(setStorageOptions); }, [id]);

  async function respond(offerId: string, action: "accept" | "reject" | "counter") {
    if (action === "counter") {
      const c = counterState[offerId];
      await api.patch(`/offers/${offerId}/respond`, { action, counterPrice: Number(c?.price), counterNote: c?.note });
    } else {
      await api.patch(`/offers/${offerId}/respond`, { action });
    }
    load();
  }

  async function submitGrade() {
    await api.post(`/lots/${id}/grade`, { ...gradeForm, verifiedBy: "Self-assessment (pending verification)" });
    load();
  }

  async function checkStorage() {
    if (!storageId) return;
    const data = await api.get(`/lots/${id}/storage-decision?storageId=${storageId}&storageDays=${storageDays}`);
    setStorageResult(data);
  }

  if (!lot) return <div className="text-sm text-stone-400">{t("common.loading")}</div>;

  return (
    <div>
      <SectionHeading title={t("lotDetail.title", { id: lot.id })} subtitle={t("lotDetail.subtitle", { crop: lot.crop_name, qty: lot.quantity_quintals, location: lot.location, district: lot.district })} />
      <Link to="/lots" className="text-xs text-brand-600 font-medium">{t("lotDetail.backToLots")}</Link>

      <div className="grid md:grid-cols-3 gap-3 my-4">
        <div className="card p-4"><div className="text-xs text-stone-500">{t("lotDetail.status")}</div><StatusBadge status={lot.status} /></div>
        <div className="card p-4"><div className="text-xs text-stone-500">{t("lotDetail.grade")}</div><div className="font-semibold">{lot.grade || t("lots.ungraded")}</div></div>
        <div className="card p-4"><div className="text-xs text-stone-500">{t("lotDetail.expectedPrice")}</div><div className="font-semibold">₹{lot.expected_price}/q</div></div>
      </div>

      {/* Quality grading */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("lotDetail.gradingTitle")}</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div><label className="field-label">{t("lotDetail.size")}</label>
            <select className="input" value={gradeForm.sizeRating} onChange={(e) => setGradeForm({ ...gradeForm, sizeRating: e.target.value })}>
              <option value="Good">{t("common.ratings.good")}</option>
              <option value="Average">{t("common.ratings.average")}</option>
              <option value="Poor">{t("common.ratings.poor")}</option>
            </select>
          </div>
          <div><label className="field-label">{t("lotDetail.moisture")}</label>
            <select className="input" value={gradeForm.moistureRating} onChange={(e) => setGradeForm({ ...gradeForm, moistureRating: e.target.value })}>
              <option value="Good">{t("common.ratings.good")}</option>
              <option value="Acceptable">{t("common.ratings.acceptable")}</option>
              <option value="Poor">{t("common.ratings.poor")}</option>
            </select>
          </div>
          <div><label className="field-label">{t("lotDetail.damagePct")}</label>
            <input className="input" type="number" value={gradeForm.damagePct} onChange={(e) => setGradeForm({ ...gradeForm, damagePct: Number(e.target.value) })} />
          </div>
          <div><label className="field-label">{t("lotDetail.foreignMaterialPct")}</label>
            <input className="input" type="number" value={gradeForm.foreignMaterialPct} onChange={(e) => setGradeForm({ ...gradeForm, foreignMaterialPct: Number(e.target.value) })} />
          </div>
          <div><label className="field-label">{t("lotDetail.appearance")}</label>
            <select className="input" value={gradeForm.appearanceRating} onChange={(e) => setGradeForm({ ...gradeForm, appearanceRating: e.target.value })}>
              <option value="Good">{t("common.ratings.good")}</option>
              <option value="Average">{t("common.ratings.average")}</option>
              <option value="Poor">{t("common.ratings.poor")}</option>
            </select>
          </div>
        </div>
        <button className="btn-secondary mt-3" onClick={submitGrade}>{t("lotDetail.calculateRecordGrade")}</button>
        {lot.grades?.length > 0 && (
          <ul className="mt-3 text-xs text-stone-600 space-y-1">
            {lot.grades.map((g: any) => (
              <li key={g.id}>
                {t("lotDetail.gradeListItem", {
                  grade: g.grade,
                  size: RATING_I18N_KEY[g.size_rating] ? t(RATING_I18N_KEY[g.size_rating]) : g.size_rating,
                  moisture: RATING_I18N_KEY[g.moisture_rating] ? t(RATING_I18N_KEY[g.moisture_rating]) : g.moisture_rating,
                  damage: g.damage_pct,
                  fm: g.foreign_material_pct,
                  verified: g.verified ? t("lotDetail.verified") : t("lotDetail.selfAssessed"),
                })}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Offers */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("lotDetail.offersTitle")}</h3>
        {lot.offers?.length === 0 ? <EmptyState message={t("lotDetail.noOffersYet")} /> : (
          <div className="space-y-3">
            {lot.offers.map((o: any) => (
              <div key={o.id} className="border border-stone-200 rounded-md p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">{o.buyer_name} — ₹{o.offer_price}/q × {o.quantity_quintals} q</div>
                    <div className="text-xs text-stone-500">{t("lotDetail.paymentDelivery", { terms: o.payment_terms, date: o.delivery_date })}</div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                {o.status === "Pending" && (
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    <button className="btn-primary text-xs" onClick={() => respond(o.id, "accept")}>{t("lotDetail.accept")}</button>
                    <button className="btn-danger text-xs" onClick={() => respond(o.id, "reject")}>{t("lotDetail.reject")}</button>
                    <input
                      className="input w-28 text-xs" placeholder={t("lotDetail.counterPlaceholder")}
                      value={counterState[o.id]?.price || ""}
                      onChange={(e) => setCounterState({ ...counterState, [o.id]: { ...counterState[o.id], price: e.target.value } })}
                    />
                    <button className="btn-secondary text-xs" onClick={() => respond(o.id, "counter")}>{t("lotDetail.counterOffer")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buyer matches */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("lotDetail.matchingBuyersTitle")}</h3>
        {matches.length === 0 ? <EmptyState message={t("lotDetail.noMatches")} /> : (
          <div className="space-y-3">
            {matches.map((m) => (
              <div key={m.demandId} className="border border-stone-200 rounded-md p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-sm font-medium">{m.buyerName} <span className="text-xs text-stone-400">({t(`common.buyerTypes.${m.buyerType}`)})</span></div>
                    <div className="text-xs text-stone-500">{t("lotDetail.needsLine", { qty: m.requiredQuantity, grade: m.gradeRequired, price: m.offerPrice, distance: m.distanceKm })}</div>
                  </div>
                  <div className="text-lg font-semibold text-brand-700">{m.matchScorePct}%</div>
                </div>
                <ul className="text-xs text-stone-600 list-disc list-inside mb-2">
                  {m.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <div className="grid sm:grid-cols-2 gap-x-6">
                  <ScoreBar label={t("lotDetail.cropMatch")} value={m.scoreComponents.cropScore} max={25} />
                  <ScoreBar label={t("lotDetail.qualityMatch")} value={m.scoreComponents.qualityScore} max={20} />
                  <ScoreBar label={t("lotDetail.quantityFit")} value={m.scoreComponents.quantityScore} max={15} />
                  <ScoreBar label={t("lotDetail.price")} value={m.scoreComponents.priceScore} max={20} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage decision */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-stone-800 mb-2">{t("lotDetail.storageTitle")}</h3>
        <div className="grid sm:grid-cols-3 gap-3 items-end mb-2">
          <div>
            <label className="field-label">{t("lotDetail.storageFacility")}</label>
            <select className="input" value={storageId} onChange={(e) => setStorageId(e.target.value)}>
              <option value="">{t("lotDetail.selectFacility")}</option>
              {storageOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("lotDetail.storageDays")}</label>
            <input className="input" type="number" value={storageDays} onChange={(e) => setStorageDays(Number(e.target.value))} />
          </div>
          <button className="btn-secondary" onClick={checkStorage}>{t("lotDetail.compare")}</button>
        </div>
        {storageResult && (
          <div className="text-sm border border-stone-200 rounded-md p-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><div className="text-xs text-stone-500">{t("lotDetail.sellNowNet")}</div><div className="font-semibold">₹{storageResult.sellNowNet}/q</div></div>
              <div><div className="text-xs text-stone-500">{t("lotDetail.storeAndSellNet", { days: storageResult.storageDays })}</div><div className="font-semibold">₹{storageResult.storeAndSellNet}/q</div></div>
            </div>
            <p className={`text-xs mt-2 font-medium ${storageResult.differenceVsSellNow >= 0 ? "text-brand-700" : "text-red-600"}`}>
              {storageResult.differenceVsSellNow >= 0 ? "+" : ""}₹{storageResult.differenceVsSellNow}/q {t("lotDetail.vsSellingNow", { cost: storageResult.storageCost })}
            </p>
            <p className="text-xs text-stone-400 mt-1">{storageResult.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
