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
  const existingCropIds = new Set(baseRows.map((r) => r.id));

  // If in production, ensure any new authoritative crops are upserted into Supabase
  if (isProduction) {
    const supabase = getSupabaseAdmin();
    const missingCatalogCrops = AUTHORITATIVE_CROPS_CATALOG.filter((c) => !existingCropIds.has(c.crop_id));
    if (missingCatalogCrops.length > 0 && supabase) {
      try {
        await supabase.from("crops").upsert(
          missingCatalogCrops.map((c) => ({
            id: c.crop_id,
            name: c.name,
            category: c.category,
            unit: c.common_unit || "quintal"
          })),
          { onConflict: "id" }
        );
        for (const mc of missingCatalogCrops) {
          baseRows.push({
            id: mc.crop_id,
            name: mc.name,
            category: mc.category,
            unit: mc.common_unit || "quintal"
          });
        }
      } catch (err) {
        console.warn("Failed to auto-upsert new crops to Supabase:", err.message);
      }
    }
  } else {
    for (const mc of AUTHORITATIVE_CROPS_CATALOG) {
      if (!existingCropIds.has(mc.crop_id)) {
        baseRows.push({
          id: mc.crop_id,
          name: mc.name,
          category: mc.category,
          unit: mc.common_unit || "quintal"
        });
      }
    }
  }

  // Merge database crops with verified metadata while strictly preserving existing IDs
  const enriched = baseRows.map((r) => {
    const meta = catalogMap.get(r.id);
    return {
      id: r.id,
      crop_id: r.id,
      name: r.name,
      scientific_name: meta?.scientific_name || null,
      unit: r.unit || "quintal",
      common_unit: r.unit || "quintal",
      category: r.category || meta?.category || "Produce",
      local_names: meta?.local_names || {
        hindi: r.name,
        marathi: r.name,
        telugu: r.name
      },
      hindi_name: meta?.local_names?.hindi || r.name,
      marathi_name: meta?.local_names?.marathi || r.name,
      telugu_name: meta?.local_names?.telugu || r.name,
      season: meta?.season || "Kharif / Rabi",
      harvest_period: meta?.harvest_period || "Seasonal",
      storage_notes: meta?.storage_notes || "Store in dry well-aerated facility.",
      moisture_limit: meta?.quality_parameters?.moisture_max_pct || null,
      quality_parameters: meta?.quality_parameters || { grade_standards: "FAQ Standard" },
      active: true,
      verification_status: meta?.verification_status || "VERIFIED",
      source: meta?.source || "ICAR / Directorate of Economics and Statistics",
      created_at: r.created_at || null
    };
  });

  res.json(enriched);
});

export default router;
