import { Router } from "express";
import { db } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const supabase = getSupabaseAdmin();
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction && supabase) {
    try {
      const { data, error } = await supabase.from("crops").select("*").order("name");
      if (!error && data) {
        return res.json(data);
      }
    } catch (_) {}
  }

  res.json(db.prepare(`SELECT * FROM crops ORDER BY name`).all());
});

export default router;
