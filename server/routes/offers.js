import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { assertRequired } from "../lib/validate.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

const router = Router();

router.get("/", async (req, res) => {
  const { lotId, buyerId } = req.query;
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      let query = supabase.from("offers").select("*, buyers (name), lots (crop_id, owner_id, owner_type)");
      if (lotId) query = query.eq("lot_id", lotId);
      if (buyerId) query = query.eq("buyer_id", buyerId);
      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });

      const formatted = (data || []).map((o) => ({
        ...o,
        buyer_name: o.buyers?.name,
        crop_id: o.lots?.crop_id,
        owner_id: o.lots?.owner_id,
        owner_type: o.lots?.owner_type,
      }));
      return res.json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  let q = `SELECT o.*, b.name as buyer_name, l.crop_id, l.owner_id, l.owner_type FROM offers o
            JOIN buyers b ON b.id = o.buyer_id JOIN lots l ON l.id = o.lot_id WHERE 1=1`;
  const params = [];
  if (lotId) { q += ` AND o.lot_id = ?`; params.push(lotId); }
  if (buyerId) { q += ` AND o.buyer_id = ?`; params.push(buyerId); }
  q += ` ORDER BY o.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

// MODULE 8: Buyer submits a digital offer
router.post("/", async (req, res) => {
  if (!assertRequired(req, res, ["lotId", "buyerId", "offerPrice", "quantityQuintals"])) return;
  const b = req.body;

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: lot } = await supabase.from("lots").select("id, owner_type, owner_id").eq("id", b.lotId).maybeSingle();
      if (!lot) return res.status(404).json({ error: `unknown lotId: ${b.lotId}` });

      const { data: buyer } = await supabase.from("buyers").select("id, name").eq("id", b.buyerId).maybeSingle();
      if (!buyer) return res.status(404).json({ error: `unknown buyerId: ${b.buyerId}` });

      const offerId = `OFR-${Math.floor(1000 + Math.random() * 8999)}`;
      const { data: created, error: insErr } = await supabase
        .from("offers")
        .insert({
          id: offerId,
          lot_id: b.lotId,
          buyer_id: b.buyerId,
          offer_price: b.offerPrice,
          quantity_quintals: b.quantityQuintals,
          delivery_date: b.deliveryDate || null,
          payment_terms: b.paymentTerms || null,
          expiry_date: b.expiryDate || null,
          status: "Pending",
          counter_of: b.counterOf || null,
        })
        .select()
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });

      await supabase.from("lots").update({ status: "Under negotiation" }).eq("id", b.lotId).eq("status", "Open for offers");

      // Notify owner
      const ownerTable = lot.owner_type === "fpo" ? "fpos" : "farmers";
      const { data: owner } = await supabase.from(ownerTable).select("user_id").eq("id", lot.owner_id).maybeSingle();
      if (owner?.user_id) {
        await supabase.from("notifications").insert({
          id: `notif-${nanoid(8)}`,
          user_id: owner.user_id,
          message: `New offer received on ${b.lotId} from ${buyer.name || "a buyer"}.`,
          read: 0,
        });
      }

      return res.status(201).json(created);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const lotExists = db.prepare(`SELECT 1 FROM lots WHERE id = ?`).get(b.lotId);
  if (!lotExists) return res.status(404).json({ error: `unknown lotId: ${b.lotId}` });
  const buyerExists = db.prepare(`SELECT 1 FROM buyers WHERE id = ?`).get(b.buyerId);
  if (!buyerExists) return res.status(404).json({ error: `unknown buyerId: ${b.buyerId}` });

  const offerId = `OFR-${Math.floor(1000 + Math.random() * 8999)}`;
  db.prepare(`INSERT INTO offers (id, lot_id, buyer_id, offer_price, quantity_quintals, delivery_date, payment_terms, expiry_date, status, counter_of)
    VALUES (?,?,?,?,?,?,?,?, 'Pending', ?)`).run(
    offerId, b.lotId, b.buyerId, b.offerPrice, b.quantityQuintals, b.deliveryDate || null, b.paymentTerms || null, b.expiryDate || null, b.counterOf || null
  );
  db.prepare(`UPDATE lots SET status = 'Under negotiation' WHERE id = ? AND status = 'Open for offers'`).run(b.lotId);

  const lot = db.prepare(`SELECT owner_type, owner_id FROM lots WHERE id = ?`).get(b.lotId);
  if (lot) {
    const ownerTable = lot.owner_type === "fpo" ? "fpos" : "farmers";
    const owner = db.prepare(`SELECT user_id FROM ${ownerTable} WHERE id = ?`).get(lot.owner_id);
    const buyer = db.prepare(`SELECT name FROM buyers WHERE id = ?`).get(b.buyerId);
    if (owner && owner.user_id) {
      db.prepare(`INSERT INTO notifications (id, user_id, message, read) VALUES (?,?,?,0)`).run(
        `notif-${nanoid(8)}`,
        owner.user_id,
        `New offer received on ${b.lotId} from ${buyer ? buyer.name : "a buyer"}.`
      );
    }
  }

  res.status(201).json(db.prepare(`SELECT * FROM offers WHERE id = ?`).get(offerId));
});

// Farmer/FPO responds: accept / reject / counter
router.patch("/:id/respond", async (req, res) => {
  if (!assertRequired(req, res, ["action"])) return;
  const { action, counterPrice, counterQuantity, counterNote } = req.body;
  if (!["accept", "reject", "counter"].includes(action)) {
    return res.status(400).json({ error: "action must be accept | reject | counter" });
  }
  if (action === "counter" && (counterPrice === undefined || counterPrice === null)) {
    return res.status(400).json({ error: "Missing required field(s): counterPrice" });
  }

  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  const supabase = getSupabaseAdmin();

  if (isProduction) {
    if (!supabase) return res.status(503).json({ error: "Database unavailable" });
    try {
      const { data: offer } = await supabase.from("offers").select("*").eq("id", req.params.id).maybeSingle();
      if (!offer) return res.status(404).json({ error: "Offer not found" });

      if (action === "accept") {
        await supabase.from("offers").update({ status: "Accepted" }).eq("id", offer.id);
        const { data: lot } = await supabase.from("lots").select("*").eq("id", offer.lot_id).single();
        const txnId = `TXN-${Math.floor(1000 + Math.random() * 8999)}`;
        await supabase.from("transactions").insert({
          id: txnId,
          lot_id: lot.id,
          offer_id: offer.id,
          farmer_or_fpo_id: lot.owner_id,
          buyer_id: offer.buyer_id,
          quantity_quintals: offer.quantity_quintals,
          agreed_price: offer.offer_price,
          total_amount: offer.quantity_quintals * offer.offer_price,
          stage: "Deal Accepted",
        });
        await supabase.from("lots").update({ status: "Sold" }).eq("id", lot.id);
        return res.json({ offer: { ...offer, status: "Accepted" }, transactionId: txnId });
      }

      if (action === "reject") {
        await supabase.from("offers").update({ status: "Rejected" }).eq("id", offer.id);
        return res.json({ ...offer, status: "Rejected" });
      }

      if (action === "counter") {
        await supabase.from("offers").update({ status: "Countered" }).eq("id", offer.id);
        const counterId = `OFR-${Math.floor(1000 + Math.random() * 8999)}`;
        const { data: createdCounter, error: cntErr } = await supabase
          .from("offers")
          .insert({
            id: counterId,
            lot_id: offer.lot_id,
            buyer_id: offer.buyer_id,
            offer_price: counterPrice,
            quantity_quintals: counterQuantity || offer.quantity_quintals,
            delivery_date: offer.delivery_date,
            payment_terms: counterNote || offer.payment_terms,
            expiry_date: offer.expiry_date,
            status: "Pending",
            counter_of: offer.id,
          })
          .select()
          .single();
        if (cntErr) return res.status(500).json({ error: cntErr.message });
        return res.status(201).json(createdCounter);
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const offer = db.prepare(`SELECT * FROM offers WHERE id = ?`).get(req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  if (action === "accept") {
    db.prepare(`UPDATE offers SET status = 'Accepted' WHERE id = ?`).run(offer.id);
    const lot = db.prepare(`SELECT * FROM lots WHERE id = ?`).get(offer.lot_id);
    const txnId = `TXN-${Math.floor(1000 + Math.random() * 8999)}`;
    db.prepare(`INSERT INTO transactions (id, lot_id, offer_id, farmer_or_fpo_id, buyer_id, quantity_quintals, agreed_price, total_amount, stage)
      VALUES (?,?,?,?,?,?,?,?, 'Deal Accepted')`).run(
      txnId, lot.id, offer.id, lot.owner_id, offer.buyer_id, offer.quantity_quintals, offer.offer_price, offer.quantity_quintals * offer.offer_price
    );
    db.prepare(`UPDATE lots SET status = 'Sold' WHERE id = ?`).run(lot.id);
    return res.json({ offer: { ...offer, status: "Accepted" }, transactionId: txnId });
  }

  if (action === "reject") {
    db.prepare(`UPDATE offers SET status = 'Rejected' WHERE id = ?`).run(offer.id);
    return res.json({ ...offer, status: "Rejected" });
  }

  if (action === "counter") {
    db.prepare(`UPDATE offers SET status = 'Countered' WHERE id = ?`).run(offer.id);
    const counterId = `OFR-${Math.floor(1000 + Math.random() * 8999)}`;
    db.prepare(`INSERT INTO offers (id, lot_id, buyer_id, offer_price, quantity_quintals, delivery_date, payment_terms, expiry_date, status, counter_of)
      VALUES (?,?,?,?,?,?,?,?, 'Pending', ?)`).run(
      counterId, offer.lot_id, offer.buyer_id, counterPrice, counterQuantity || offer.quantity_quintals, offer.delivery_date, counterNote || offer.payment_terms, offer.expiry_date, offer.id
    );
    return res.status(201).json(db.prepare(`SELECT * FROM offers WHERE id = ?`).get(counterId));
  }

  res.status(400).json({ error: "action must be accept | reject | counter" });
});

export default router;
