import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", (req, res) => {
  const { raisedBy, status } = req.query;
  let q = `SELECT g.*, t.buyer_id, t.farmer_or_fpo_id FROM grievances g JOIN transactions t ON t.id = g.transaction_id WHERE 1=1`;
  const params = [];
  if (raisedBy) { q += ` AND g.raised_by = ?`; params.push(raisedBy); }
  if (status) { q += ` AND g.status = ?`; params.push(status); }
  q += ` ORDER BY g.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.post("/", (req, res) => {
  if (!assertRequired(req, res, ["transactionId", "raisedBy", "issueCategory", "description"])) return;
  const b = req.body;

  const txnExists = db.prepare(`SELECT 1 FROM transactions WHERE id = ?`).get(b.transactionId);
  if (!txnExists) return res.status(404).json({ error: `unknown transactionId: ${b.transactionId}` });

  const grievanceId = `GRV-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(`INSERT INTO grievances (id, transaction_id, raised_by, issue_category, description, evidence, status)
    VALUES (?,?,?,?,?,?, 'Submitted')`).run(grievanceId, b.transactionId, b.raisedBy, b.issueCategory, b.description, b.evidence || null);
  res.status(201).json(db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(grievanceId));
});

// Admin updates grievance status/resolution
router.patch("/:id", (req, res) => {
  // Bug #3 fix: existence check before UPDATE — see lots.js for the same fix
  // and why it matters (silent 200-empty-body crash on the client).
  const existing = db.prepare(`SELECT id FROM grievances WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Grievance not found" });
  const { status, resolutionNotes } = req.body;
  db.prepare(`UPDATE grievances SET status = ?, resolution_notes = COALESCE(?, resolution_notes), updated_at = datetime('now') WHERE id = ?`).run(status ?? null, resolutionNotes ?? null, req.params.id);
  const updated = db.prepare(`SELECT * FROM grievances WHERE id = ?`).get(req.params.id);

  // Notify whoever raised the grievance — notifications table added by M6,
  // see PROJECT_CONTRACT.md section 3. raised_by is a farmer/fpo/buyer
  // profile id (not a users.id), so resolve it to a user across all three
  // owner tables.
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
