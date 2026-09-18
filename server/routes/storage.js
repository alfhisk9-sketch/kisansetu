import { Router } from "express";
import { db } from "../db.js";
import { calcHaversineDistanceKm } from "../lib/algorithms.js";

const router = Router();

router.get("/", (req, res) => {
  const { district, cropName, userLat, userLng } = req.query;
  let rows = db.prepare(`SELECT * FROM storage_facilities`).all();
  if (district) rows = rows.filter((r) => r.district === district);
  if (cropName) rows = rows.filter((r) => (r.crop_suitability || "").split(",").map((s) => s.trim()).includes(cropName));

  const nLat = Number(userLat);
  const nLng = Number(userLng);
  if (!isNaN(nLat) && !isNaN(nLng)) {
    rows = rows.map((r) => {
      let distanceKm = null;
      if (r.latitude && r.longitude) {
        const straight = calcHaversineDistanceKm(nLat, nLng, r.latitude, r.longitude);
        distanceKm = straight != null ? Math.round(straight * 1.2) : null;
      }
      return { ...r, distanceKm, distanceLabel: distanceKm ? `${distanceKm} km (approx.)` : "Distance on request" };
    });
    rows.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  res.json(rows);
});

export default router;
