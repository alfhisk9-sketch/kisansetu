import { Router } from "express";
import { db } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { calcHaversineDistanceKm } from "../lib/algorithms.js";

const router = Router();

router.get("/", async (req, res) => {
  const { district, cropName, userLat, userLng } = req.query;
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let rows = null;
  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("storage_facilities").select("*");
      if (error) return res.status(500).json({ error: error.message });
      rows = data || [];
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    rows = db.prepare(`SELECT * FROM storage_facilities`).all();
  }

  if (district) rows = rows.filter((r) => r.district === district);
  if (cropName) rows = rows.filter((r) => (r.crop_suitability || "").split(",").map((s) => s.trim()).includes(cropName));

  const nLat = Number(userLat);
  const nLng = Number(userLng);
  if (!isNaN(nLat) && !isNaN(nLng)) {
    rows = rows.map((r) => {
      let distanceKm = null;
      if (r.latitude && r.longitude) {
        const straight = calcHaversineDistanceKm(nLat, nLng, Number(r.latitude), Number(r.longitude));
        distanceKm = straight != null ? Math.round(straight * 1.2) : null;
      }
      return { ...r, distanceKm, distanceLabel: distanceKm ? `${distanceKm} km (approx.)` : "Distance on request" };
    });
    rows.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  res.json(rows);
});

export default router;
