import { Router } from "express";
import { db } from "../db.js";
import { calcMarketCharges, calcNetRealization, calcTransportCost, estimateDistanceKm } from "../lib/algorithms.js";
import { DISTRICT_DISTANCES } from "../data/distances.js";

const router = Router();

router.get("/summary", (req, res) => {
  const registeredFarmers = db.prepare(`SELECT COUNT(*) as n FROM farmers`).get().n;
  const activeFpos = db.prepare(`SELECT COUNT(*) as n FROM fpos`).get().n;
  const verifiedBuyers = db.prepare(`SELECT COUNT(*) as n FROM buyers WHERE verified = 1`).get().n;
  const totalBuyers = db.prepare(`SELECT COUNT(*) as n FROM buyers`).get().n;
  const activeLots = db.prepare(`SELECT COUNT(*) as n FROM lots WHERE status IN ('Open for offers','Under negotiation')`).get().n;
  const openOffers = db.prepare(`SELECT COUNT(*) as n FROM offers WHERE status = 'Pending'`).get().n;
  const completedTxns = db.prepare(`SELECT COUNT(*) as n, SUM(total_amount) as total FROM transactions WHERE stage = 'Payment Received'`).get();
  const openDisputes = db.prepare(`SELECT COUNT(*) as n FROM grievances WHERE status NOT IN ('Resolved','Rejected')`).get().n;
  const delayedPayments = db.prepare(`SELECT COUNT(*) as n FROM payments WHERE status IN ('Delayed','Pending')`).get().n;
  const activeLogistics = db.prepare(`SELECT COUNT(*) as n FROM logistics WHERE status IN ('Requested','Assigned','In Transit')`).get().n;

  // Average farmer net realization across a representative sample of current market prices
  const cropRows = db.prepare(`SELECT DISTINCT crop_id FROM market_prices`).all();
  let netRealizations = [];
  for (const { crop_id } of cropRows) {
    const latest = db.prepare(`SELECT modal_price FROM market_prices WHERE crop_id = ? ORDER BY date DESC LIMIT 1`).get(crop_id);
    if (!latest) continue;
    const marketCharges = calcMarketCharges(latest.modal_price);
    const transport = calcTransportCost({ distanceKm: 50, quantityQuintals: 20 });
    netRealizations.push(calcNetRealization({ sellingPrice: latest.modal_price, transportCost: transport, marketCharges }));
  }
  const avgNetRealization = netRealizations.length ? Math.round(netRealizations.reduce((a, b) => a + b, 0) / netRealizations.length) : 0;

  res.json({
    registeredFarmers,
    activeFpos,
    verifiedBuyers,
    totalBuyers,
    activeLots,
    openOffers,
    completedTransactions: completedTxns.n,
    completedTransactionsValue: completedTxns.total || 0,
    openDisputes,
    delayedPayments,
    activeLogistics,
    avgNetRealizationPerQuintal: avgNetRealization,
  });
});

router.get("/charts", (req, res) => {
  // 1. Average market price trend (last 14 days, across all crops, normalized index not needed — show onion as flagship)
  const priceTrend = db.prepare(`SELECT date, AVG(modal_price) as avg_price FROM market_prices WHERE crop_id = 'crop-onion' GROUP BY date ORDER BY date ASC`).all();

  // 2. Active lots by status
  const lotsByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM lots GROUP BY status`).all();

  // 3. Buyer demand by crop
  const demandByCrop = db.prepare(`SELECT c.name as crop, SUM(bd.quantity_quintals) as qty FROM buyer_demands bd JOIN crops c ON c.id = bd.crop_id WHERE bd.status = 'Open' GROUP BY c.name`).all();

  // 4. Transaction volume by stage
  const txnByStage = db.prepare(`SELECT stage, COUNT(*) as count FROM transactions GROUP BY stage`).all();

  // 5. Dispute status breakdown
  const disputesByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM grievances GROUP BY status`).all();

  res.json({ priceTrend, lotsByStatus, demandByCrop, txnByStage, disputesByStatus });
});

export default router;
