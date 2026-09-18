import { Router } from "express";
import { db } from "../db.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";
import { estimateDistanceKm, calcTransportCost } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", (req, res) => {
  const { farmerOrFpoId, buyerId } = req.query;
  let q = `SELECT t.*, b.name as buyer_name, l.crop_id, c.name as crop_name FROM transactions t
            JOIN buyers b ON b.id = t.buyer_id JOIN lots l ON l.id = t.lot_id JOIN crops c ON c.id = l.crop_id WHERE 1=1`;
  const params = [];
  if (farmerOrFpoId) { q += ` AND t.farmer_or_fpo_id = ?`; params.push(farmerOrFpoId); }
  if (buyerId) { q += ` AND t.buyer_id = ?`; params.push(buyerId); }
  q += ` ORDER BY t.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.get("/:id", (req, res) => {
  const txn = db.prepare(`SELECT t.*, b.name as buyer_name, l.crop_id, l.district as pickup_district, c.name as crop_name
    FROM transactions t JOIN buyers b ON b.id = t.buyer_id JOIN lots l ON l.id = t.lot_id JOIN crops c ON c.id = l.crop_id WHERE t.id = ?`).get(req.params.id);
  if (!txn) return res.status(404).json({ error: "Transaction not found" });
  const logistics = db.prepare(`SELECT * FROM logistics WHERE transaction_id = ?`).get(txn.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE transaction_id = ?`).all(txn.id);
  const grievances = db.prepare(`SELECT * FROM grievances WHERE transaction_id = ?`).all(txn.id);
  res.json({ ...txn, logistics, payments, grievances });
});

// MODULE 9: create logistics request for an accepted transaction
router.post("/:id/logistics", (req, res) => {
  const txn = db.prepare(`SELECT t.*, l.district as pickup_district, l.location as pickup_location FROM transactions t JOIN lots l ON l.id = t.lot_id WHERE t.id = ?`).get(req.params.id);
  if (!txn) return res.status(404).json({ error: "Transaction not found" });
  const buyer = db.prepare(`SELECT * FROM buyers WHERE id = ?`).get(txn.buyer_id);

  const distanceKm = estimateDistanceKm(DISTRICT_DISTANCES, txn.pickup_district, buyer.location);
  const transportCost = calcTransportCost({ distanceKm, quantityQuintals: txn.quantity_quintals });

  const logId = `LOG-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(`INSERT INTO logistics (id, transaction_id, pickup_location, destination, quantity_quintals, distance_km, transport_cost, vehicle_requirement, pickup_date, delivery_date, status)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'Requested')`).run(
    logId, txn.id, txn.pickup_location, buyer.location, txn.quantity_quintals, distanceKm, transportCost * txn.quantity_quintals,
    req.body.vehicleRequirement || (txn.quantity_quintals > 50 ? "10-tonne truck" : "6-tonne truck"), req.body.pickupDate || null, req.body.deliveryDate || null
  );
  db.prepare(`UPDATE transactions SET stage = 'Invoice Generated' WHERE id = ?`).run(txn.id);
  res.status(201).json(db.prepare(`SELECT * FROM logistics WHERE id = ?`).get(logId));
});

router.patch("/:id/logistics/status", (req, res) => {
  const log = db.prepare(`SELECT * FROM logistics WHERE transaction_id = ?`).get(req.params.id);
  if (!log) return res.status(404).json({ error: "Logistics record not found" });
  if (!assertRequired(req, res, ["status"])) return;
  const { status, vehicleNo } = req.body;
  db.prepare(`UPDATE logistics SET status = ?, vehicle_no = COALESCE(?, vehicle_no) WHERE id = ?`).run(status, vehicleNo ?? null, log.id);

  const stageMap = { Assigned: "Invoice Generated", "In Transit": "Goods Dispatched", Delivered: "Goods Delivered" };
  if (stageMap[status]) db.prepare(`UPDATE transactions SET stage = ? WHERE id = ?`).run(stageMap[status], req.params.id);

  res.json(db.prepare(`SELECT * FROM logistics WHERE id = ?`).get(log.id));
});

// MODULE 11: payment tracking
router.post("/:id/payments/advance-stage", (req, res) => {
  const txn = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(req.params.id);
  if (!txn) return res.status(404).json({ error: "Transaction not found" });

  const flow = ["Deal Accepted", "Invoice Generated", "Goods Dispatched", "Goods Delivered", "Payment Initiated", "Payment Received"];
  const idx = flow.indexOf(txn.stage);
  const nextStage = flow[Math.min(idx + 1, flow.length - 1)];
  db.prepare(`UPDATE transactions SET stage = ? WHERE id = ?`).run(nextStage, txn.id);

  if (nextStage === "Payment Initiated") {
    const payId = `PAY-${Math.floor(1000 + Math.random() * 8999)}`;
    db.prepare(`INSERT INTO payments (id, transaction_id, amount, buyer_id, payee_id, date, method, status)
      VALUES (?,?,?,?,?, date('now'), 'Bank transfer (mock)', 'Initiated')`).run(payId, txn.id, txn.total_amount, txn.buyer_id, txn.farmer_or_fpo_id);
  }
  if (nextStage === "Payment Received") {
    db.prepare(`UPDATE payments SET status = 'Received' WHERE transaction_id = ?`).run(txn.id);
  }

  res.json(db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(txn.id));
});

export default router;
