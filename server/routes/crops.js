import { Router } from "express";
import { db } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("crops").select("*").order("name");
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.json(db.prepare(`SELECT * FROM crops ORDER BY name`).all());
});

export default router;
