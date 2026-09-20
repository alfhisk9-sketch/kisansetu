import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { assertRequired } from "../lib/validate.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const { raisedBy, status } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      let query = supabase.from("grievances").select("*, transactions (buyer_id, farmer_or_fpo_id)");
      if (raisedBy) query = query.eq("raised_by", raisedBy);
      if (status) query = query.eq("status", status);
      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const formatted = (data || []).map((g) => ({
        ...g,
        buyer_id: g.transactions?.buyer_id,
        farmer_or_fpo_id: g.transactions?.farmer_or_fpo_id,
      }));
      return res.json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  let q = `SELECT g.*, t.buyer_id, t.farmer_or_fpo_id FROM grievances g JOIN transactions t ON t.id = g.transaction_id WHERE 1=1`;
  const params = [];
  if (raisedBy) { q += ` AND g.raised_by = ?`; params.push(raisedBy); }
  if (status) { q += ` AND g.status = ?`; params.push(status); }
  q += ` ORDER BY g.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.post("/", async (req, res) => {
  if (!assertRequired(req, res, ["transactionId", "raisedBy", "issueCategory", "description"])) return;
  const b = req.body;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: txn, error: txnErr } = await supabase.from("transactions").select("id").eq("id", b.transactionId).maybeSingle();
      if (txnErr) return res.status(500).json({ error: txnErr.message });
      if (!txn) return res.status(404).json({ error: `unknown transactionId: ${b.transactionId}` });

      const grievanceId = `GRV-${Math.floor(1000 + Math.random() * 8999)}`;
      const { data: created, error: insErr } = await supabase
        .from("grievances")
        .insert({
          id: grievanceId,
          transaction_id: b.transactionId,
          raised_by: b.raisedBy,
          issue_category: b.issueCategory,
          description: b.description,
          evidence: b.evidence || null,
          status: "Submitted",
        })
        .select()
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });
      return res.status(201).json(created);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const txnExists = db.prepare(`SELECT 1 FROM transactions WHERE id = ?`).get(b.transactionId);
  if (!txnExists) return res.status(404).json({ error: `unknown transactionId: ${b.transactionId}` });

  const grievanceId = `GRV-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(`INSERT INTO grievances (id, transaction_id, raised_by, issue_category, description, evidence, status)
    VALUES (?,?,?,?,?,?, 'Submitted')`).run(grievanceId, b.transactionId, b.raisedBy, b.issueCategory, b.description, b.evidence || null);
  res.status(201).json(db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(grievanceId));
});

// Admin updates grievance status/resolution
router.patch("/:id", async (req, res) => {
  const { status, resolutionNotes } = req.body;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: existing } = await supabase.from("grievances").select("id, raised_by").eq("id", req.params.id).maybeSingle();
      if (!existing) return res.status(404).json({ error: "Grievance not found" });

      const updates = { updated_at: new Date().toISOString() };
      if (status !== undefined) updates.status = status;
      if (resolutionNotes !== undefined) updates.resolution_notes = resolutionNotes;

      const { data: updated, error: updErr } = await supabase
        .from("grievances")
        .update(updates)
        .eq("id", req.params.id)
        .select()
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });

      if (updated && status) {
        // Resolve user_id across farmers, fpos, buyers
        const [fRes, fpoRes, bRes] = await Promise.all([
          supabase.from("farmers").select("user_id").eq("id", updated.raised_by).maybeSingle(),
          supabase.from("fpos").select("user_id").eq("id", updated.raised_by).maybeSingle(),
          supabase.from("buyers").select("user_id").eq("id", updated.raised_by).maybeSingle(),
        ]);
        const raiserUserId = fRes.data?.user_id || fpoRes.data?.user_id || bRes.data?.user_id;
        if (raiserUserId) {
          await supabase.from("notifications").insert({
            id: `notif-${nanoid(8)}`,
            user_id: raiserUserId,
            message: `Your grievance ${updated.id} is now ${status}.`,
            read: 0,
          });
        }
      }

      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const existing = db.prepare(`SELECT id FROM grievances WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Grievance not found" });
  db.prepare(`UPDATE grievances SET status = ?, resolution_notes = COALESCE(?, resolution_notes), updated_at = datetime('now') WHERE id = ?`).run(status ?? null, resolutionNotes ?? null, req.params.id);
  const updated = db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(req.params.id);

  if (updated && status) {
    const raiser = db
      .prepare(
        `SELECT user_id FROM farmers WHERE id = ?
         UNION SELECT user_id FROM fpos WHERE id = ?
         UNION SELECT user_id FROM buyers WHERE id = ?`
      )
      .get(updated.raised_by, updated.raised_by, updated.raised_by);
    if (raiser && raiser.user_id) {
      db.prepare(`INSERT INTO notifications (id, user_id, message, read) VALUES (?,?,?,0)`).run(
        `notif-${nanoid(8)}`,
        raiser.user_id,
        `Your grievance ${updated.id} is now ${status}.`
      );
    }
  }

  res.json(updated);
});

export default router;
