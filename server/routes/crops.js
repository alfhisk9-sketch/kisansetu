import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { AUTHORITATIVE_CROPS_CATALOG } from "../services/cropMasterService.js";

const router = Router();

router.get("/", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  let baseRows = [];
  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("crops").select("*").order("name");
      if (error) return res.status(500).json({ error: error.message });
      baseRows = data || [];
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const db = getDb();
    baseRows = db.prepare(`SELECT * FROM crops ORDER BY name`).all();
  }

  // Create a map of authoritative crops metadata by crop_id
  const catalogMap = new Map(AUTHORITATIVE_CROPS_CATALOG.map((c) => [c.crop_id, c]));

  // Merge database crops with verified metadata while strictly preserving existing IDs
  const enriched = baseRows.map((r) => {
    const meta = catalogMap.get(r.id);
    return {
      id: r.id,
      crop_id: r.id,
      name: r.name,
      unit: r.unit || "quintal",
      common_unit: r.unit || "quintal",
      category: r.category || meta?.category || "Produce",
      local_names: meta?.local_names || {
        hindi: r.name,
        marathi: r.name,
        telugu: r.name
      },
      season: meta?.season || "Kharif / Rabi",
      harvest_period: meta?.harvest_period || "Seasonal",
      storage_notes: meta?.storage_notes || "Store in dry well-aerated facility.",
      quality_parameters: meta?.quality_parameters || { grade_standards: "FAQ Standard" },
      active: true,
      created_at: r.created_at || null
    };
  });

  res.json(enriched);
});

export default router;
