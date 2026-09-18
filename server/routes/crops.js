import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(db.prepare(`SELECT * FROM crops ORDER BY name`).all());
});

export default router;
