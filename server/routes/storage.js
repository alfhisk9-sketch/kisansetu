import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const { district, cropName } = req.query;
  let rows = db.prepare(`SELECT * FROM storage_facilities`).all();
  if (district) rows = rows.filter((r) => r.district === district);
  // Bug #6 fix: crop_suitability is a nullable column (server/db.js) — guard
  // against calling .split on null/undefined so a facility missing this
  // field doesn't 500 the whole endpoint for every user.
  if (cropName) rows = rows.filter((r) => (r.crop_suitability || "").split(",").map((s) => s.trim()).includes(cropName));
  res.json(rows);
});

export default router;
