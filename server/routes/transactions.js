import { Router } from "express";
import { db } from "../db.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";
import { estimateDistanceKm, calcTransportCost } from "../lib/algorithms.js";
import { assertRequired } from "../lib/validate.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const { farmerOrFpoId, buyerId } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      let query = supabase.from("transactions").select("*, buyers (name), lots (crop_id, crops (name))");
      if (farmerOrFpoId) query = query.eq("farmer_or_fpo_id", farmerOrFpoId);
      if (buyerId) query = query.eq("buyer_id", buyerId);
      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const formatted = (data || []).map((t) => ({
        ...t,
        buyer_name: t.buyers?.name,
        crop_id: t.lots?.crop_id,
        crop_name: t.lots?.crops?.name,
      }));
      return res.json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  let q = `SELECT t.*, b.name as buyer_name, l.crop_id, c.name as crop_name FROM transactions t
            JOIN buyers b ON b.id = t.buyer_id JOIN lots l ON l.id = t.lot_id JOIN crops c ON c.id = l.crop_id WHERE 1=1`;
  const params = [];
  if (farmerOrFpoId) { q += ` AND t.farmer_or_fpo_id = ?`; params.push(farmerOrFpoId); }
  if (buyerId) { q += ` AND t.buyer_id = ?`; params.push(buyerId); }
  q += ` ORDER BY t.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

router.get("/:id", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: txn, error: tErr } = await supabase
        .from("transactions")
        .select("*, buyers (name), lots (crop_id, district, location, crops (name))")
        .eq("id", req.params.id)
        .maybeSingle();
      if (tErr) return res.status(500).json({ error: tErr.message });
      if (!txn) return res.status(404).json({ error: "Transaction not found" });

      const [logRes, payRes, grvRes] = await Promise.all([
        supabase.from("logistics").select("*").eq("transaction_id", txn.id).maybeSingle(),
        supabase.from("payments").select("*").eq("transaction_id", txn.id),
        supabase.from("grievances").select("*").eq("transaction_id", txn.id),
      ]);

      const formatted = {
        ...txn,
        buyer_name: txn.buyers?.name,
        crop_id: txn.lots?.crop_id,
        pickup_district: txn.lots?.district,
        pickup_location: txn.lots?.location,
        crop_name: txn.lots?.crops?.name,
        logistics: logRes.data || null,
        payments: payRes.data || [],
        grievances: grvRes.data || [],
      };

      return res.json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const txn = db.prepare(`SELECT t.*, b.name as buyer_name, l.crop_id, l.district as pickup_district, c.name as crop_name
    FROM transactions t JOIN buyers b ON b.id = t.buyer_id JOIN lots l ON l.id = t.lot_id JOIN crops c ON c.id = l.crop_id WHERE t.id = ?`).get(req.params.id);
  if (!txn) return res.status(404).json({ error: "Transaction not found" });
  const logistics = db.prepare(`SELECT * FROM logistics WHERE transaction_id = ?`).get(txn.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE transaction_id = ?`).all(txn.id);
  const grievances = db.prepare(`SELECT * FROM grievances WHERE transaction_id = ?`).all(txn.id);
  res.json({ ...txn, logistics, payments, grievances });
});

// MODULE 9: create logistics request for an accepted transaction
router.post("/:id/logistics", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: txn } = await supabase.from("transactions").select("*, lots (district, location)").eq("id", req.params.id).maybeSingle();
      if (!txn) return res.status(404).json({ error: "Transaction not found" });

      const { data: buyer } = await supabase.from("buyers").select("*").eq("id", txn.buyer_id).maybeSingle();
      const pickupDistrict = txn.lots?.district;
      const pickupLocation = txn.lots?.location;
      const destination = buyer?.location || "Destination";

      const distanceKm = estimateDistanceKm(DISTRICT_DISTANCES, pickupDistrict, destination);
      const transportCost = calcTransportCost({ distanceKm, quantityQuintals: txn.quantity_quintals });

      const logId = `LOG-${Math.floor(1000 + Math.random() * 8999)}`;
      const { data: createdLog, error: insErr } = await supabase
        .from("logistics")
        .insert({
          id: logId,
          transaction_id: txn.id,
          pickup_location: pickupLocation,
          destination,
          quantity_quintals: txn.quantity_quintals,
          distance_km: distanceKm,
          transport_cost: transportCost * txn.quantity_quintals,
          vehicle_requirement: req.body.vehicleRequirement || (txn.quantity_quintals > 50 ? "10-tonne truck" : "6-tonne truck"),
          pickup_date: req.body.pickupDate || null,
          delivery_date: req.body.deliveryDate || null,
          status: "Requested",
        })
        .select()
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });

      await supabase.from("transactions").update({ stage: "Invoice Generated" }).eq("id", txn.id);
      return res.status(201).json(createdLog);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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

router.patch("/:id/logistics/status", async (req, res) => {
  if (!assertRequired(req, res, ["status"])) return;
  const { status, vehicleNo } = req.body;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: log } = await supabase.from("logistics").select("*").eq("transaction_id", req.params.id).maybeSingle();
      if (!log) return res.status(404).json({ error: "Logistics record not found" });

      const updates = { status };
      if (vehicleNo) updates.vehicle_no = vehicleNo;

      const { data: updatedLog, error: updErr } = await supabase
        .from("logistics")
        .update(updates)
        .eq("id", log.id)
        .select()
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });

      const stageMap = { Assigned: "Invoice Generated", "In Transit": "Goods Dispatched", Delivered: "Goods Delivered" };
      if (stageMap[status]) {
        await supabase.from("transactions").update({ stage: stageMap[status] }).eq("id", req.params.id);
      }

      return res.json(updatedLog);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const log = db.prepare(`SELECT * FROM logistics WHERE transaction_id = ?`).get(req.params.id);
  if (!log) return res.status(404).json({ error: "Logistics record not found" });
  db.prepare(`UPDATE logistics SET status = ?, vehicle_no = COALESCE(?, vehicle_no) WHERE id = ?`).run(status, vehicleNo ?? null, log.id);

  const stageMap = { Assigned: "Invoice Generated", "In Transit": "Goods Dispatched", Delivered: "Goods Delivered" };
  if (stageMap[status]) db.prepare(`UPDATE transactions SET stage = ? WHERE id = ?`).run(stageMap[status], req.params.id);

  res.json(db.prepare(`SELECT * FROM logistics WHERE id = ?`).get(log.id));
});

// MODULE 11: payment tracking
router.post("/:id/payments/advance-stage", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: txn } = await supabase.from("transactions").select("*").eq("id", req.params.id).maybeSingle();
      if (!txn) return res.status(404).json({ error: "Transaction not found" });

      const flow = ["Deal Accepted", "Invoice Generated", "Goods Dispatched", "Goods Delivered", "Payment Initiated", "Payment Received"];
      const idx = flow.indexOf(txn.stage);
      const nextStage = flow[Math.min(idx + 1, flow.length - 1)];

      await supabase.from("transactions").update({ stage: nextStage }).eq("id", txn.id);

      if (nextStage === "Payment Initiated") {
        const payId = `PAY-${Math.floor(1000 + Math.random() * 8999)}`;
        await supabase.from("payments").insert({
          id: payId,
          transaction_id: txn.id,
          amount: txn.total_amount,
          buyer_id: txn.buyer_id,
          payee_id: txn.farmer_or_fpo_id,
          date: new Date().toISOString().slice(0, 10),
          method: "Bank transfer (mock)",
          status: "Initiated",
        });
      }
      if (nextStage === "Payment Received") {
        await supabase.from("payments").update({ status: "Received" }).eq("transaction_id", txn.id);
      }

      const { data: updatedTxn } = await supabase.from("transactions").select("*").eq("id", txn.id).single();
      return res.json(updatedTxn);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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
