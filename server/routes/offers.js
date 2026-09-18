import { Router } from "express";
import { db } from "../db.js";
import { nanoid } from "nanoid";
import { assertRequired } from "../lib/validate.js";

const router = Router();

router.get("/", (req, res) => {
  const { lotId, buyerId } = req.query;
  let q = `SELECT o.*, b.name as buyer_name, l.crop_id, l.owner_id, l.owner_type FROM offers o
            JOIN buyers b ON b.id = o.buyer_id JOIN lots l ON l.id = o.lot_id WHERE 1=1`;
  const params = [];
  if (lotId) { q += ` AND o.lot_id = ?`; params.push(lotId); }
  if (buyerId) { q += ` AND o.buyer_id = ?`; params.push(buyerId); }
  q += ` ORDER BY o.created_at DESC`;
  res.json(db.prepare(q).all(...params));
});

// MODULE 8: Buyer submits a digital offer
router.post("/", (req, res) => {
  if (!assertRequired(req, res, ["lotId", "buyerId", "offerPrice", "quantityQuintals"])) return;
  const b = req.body;

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

  // Notify the lot's owner (farmer or FPO) — notifications table added by M6,
  // see PROJECT_CONTRACT.md section 3.
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
router.patch("/:id/respond", (req, res) => {
  if (!assertRequired(req, res, ["action"])) return;
  const { action, counterPrice, counterQuantity, counterNote } = req.body; // action: accept | reject | counter
  if (!["accept", "reject", "counter"].includes(action)) {
    return res.status(400).json({ error: "action must be accept | reject | counter" });
  }
  if (action === "counter" && (counterPrice === undefined || counterPrice === null)) {
    return res.status(400).json({ error: "Missing required field(s): counterPrice" });
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
