import { Router } from "express";
import { db } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

// GET /api/notifications?userId=
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const rows = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId);
  res.json(rows);
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: notif, error: findErr } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (findErr) return res.status(500).json({ error: findErr.message });
      if (!notif) return res.status(404).json({ error: "Notification not found" });

      const { data: updated, error: updErr } = await supabase
        .from("notifications")
        .update({ read: 1 })
        .eq("id", req.params.id)
        .select()
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const notif = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(req.params.id);
  if (!notif) return res.status(404).json({ error: "Notification not found" });
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(notif.id);
  res.json(db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(notif.id));
});

export default router;
