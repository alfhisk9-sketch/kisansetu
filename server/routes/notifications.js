import { Router } from "express";
import { db } from "../db.js";

const router = Router();

// GET /api/notifications?userId=
router.get("/", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const rows = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId);
  res.json(rows);
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", (req, res) => {
  const notif = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(req.params.id);
  if (!notif) return res.status(404).json({ error: "Notification not found" });
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(notif.id);
  res.json(db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(notif.id));
});

export default router;
