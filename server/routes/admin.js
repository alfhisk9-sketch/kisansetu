import { Router } from "express";
import { isOfflineDev, getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { calcMarketCharges, calcNetRealization, calcTransportCost } from "../lib/algorithms.js";
import { requireRole } from "../lib/authMiddleware.js";
import { syncMarketData, getLatestSyncStatus } from "../services/marketDataService.js";

const router = Router();

// Strict RBAC: All /api/admin/* endpoints require the 'admin' role
router.use(requireRole(["admin"]));

router.get("/summary", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const [
        { count: registeredFarmers },
        { count: activeFpos },
        { count: verifiedBuyers },
        { count: totalBuyers },
        { count: activeLots },
        { count: openOffers },
        { count: openDisputes },
        { count: delayedPayments },
        { count: activeLogistics },
        { data: txns },
        { data: samplePrices }
      ] = await Promise.all([
        supabase.from("farmers").select("*", { count: "exact", head: true }),
        supabase.from("fpos").select("*", { count: "exact", head: true }),
        supabase.from("buyers").select("*", { count: "exact", head: true }).eq("verified", true),
        supabase.from("buyers").select("*", { count: "exact", head: true }),
        supabase.from("lots").select("*", { count: "exact", head: true }).in("status", ["Open for offers", "Under negotiation"]),
        supabase.from("offers").select("*", { count: "exact", head: true }).eq("status", "Pending"),
        supabase.from("grievances").select("*", { count: "exact", head: true }).not("status", "in", '("Resolved","Rejected")'),
        supabase.from("payments").select("*", { count: "exact", head: true }).in("status", ["Delayed", "Pending"]),
        supabase.from("logistics").select("*", { count: "exact", head: true }).in("status", ["Requested", "Assigned", "In Transit"]),
        supabase.from("transactions").select("total_amount").eq("stage", "Payment Received"),
        supabase.from("market_prices").select("modal_price").limit(10)
      ]);

      const completedTransactions = txns?.length || 0;
      const completedTransactionsValue = (txns || []).reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

      let netRealizations = [];
      for (const p of samplePrices || []) {
        const modal = Number(p.modal_price);
        if (!modal) continue;
        const marketCharges = calcMarketCharges(modal);
        const transport = calcTransportCost({ distanceKm: 50, quantityQuintals: 20 });
        netRealizations.push(calcNetRealization({ sellingPrice: modal, transportCost: transport, marketCharges }));
      }
      const avgNetRealization = netRealizations.length ? Math.round(netRealizations.reduce((a, b) => a + b, 0) / netRealizations.length) : 0;

      return res.json({
        registeredFarmers: registeredFarmers || 0,
        activeFpos: activeFpos || 0,
        verifiedBuyers: verifiedBuyers || 0,
        totalBuyers: totalBuyers || 0,
        activeLots: activeLots || 0,
        openOffers: openOffers || 0,
        completedTransactions,
        completedTransactionsValue,
        openDisputes: openDisputes || 0,
        delayedPayments: delayedPayments || 0,
        activeLogistics: activeLogistics || 0,
        avgNetRealizationPerQuintal: avgNetRealization,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // SQLite fallback
  const db = getDb();
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

router.get("/charts", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";

  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });

    try {
      const { data: prices } = await supabase
        .from("market_prices")
        .select("date, modal_price")
        .eq("crop_id", "crop-onion")
        .order("date", { ascending: true })
        .limit(14);

      const priceTrend = (prices || []).map((p) => ({ date: p.date, avg_price: Number(p.modal_price) }));

      const { data: lots } = await supabase.from("lots").select("status");
      const lotsMap = {};
      for (const l of lots || []) {
        lotsMap[l.status] = (lotsMap[l.status] || 0) + 1;
      }
      const lotsByStatus = Object.entries(lotsMap).map(([status, count]) => ({ status, count }));

      const { data: demands } = await supabase.from("buyer_demands").select("crop_id, quantity_quintals").eq("status", "Open");
      const demandMap = {};
      for (const d of demands || []) {
        demandMap[d.crop_id] = (demandMap[d.crop_id] || 0) + (Number(d.quantity_quintals) || 0);
      }
      const demandByCrop = Object.entries(demandMap).map(([crop, qty]) => ({ crop: crop.replace("crop-", ""), qty }));

      const { data: txns } = await supabase.from("transactions").select("stage");
      const txnMap = {};
      for (const t of txns || []) {
        txnMap[t.stage] = (txnMap[t.stage] || 0) + 1;
      }
      const txnByStage = Object.entries(txnMap).map(([stage, count]) => ({ stage, count }));

      const { data: disputes } = await supabase.from("grievances").select("status");
      const dispMap = {};
      for (const g of disputes || []) {
        dispMap[g.status] = (dispMap[g.status] || 0) + 1;
      }
      const disputesByStatus = Object.entries(dispMap).map(([status, count]) => ({ status, count }));

      return res.json({ priceTrend, lotsByStatus, demandByCrop, txnByStage, disputesByStatus });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // SQLite fallback
  const db = getDb();
  const priceTrend = db.prepare(`SELECT date, AVG(modal_price) as avg_price FROM market_prices WHERE crop_id = 'crop-onion' GROUP BY date ORDER BY date ASC`).all();
  const lotsByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM lots GROUP BY status`).all();
  const demandByCrop = db.prepare(`SELECT c.name as crop, SUM(bd.quantity_quintals) as qty FROM buyer_demands bd JOIN crops c ON c.id = bd.crop_id WHERE bd.status = 'Open' GROUP BY c.name`).all();
  const txnByStage = db.prepare(`SELECT stage, COUNT(*) as count FROM transactions GROUP BY stage`).all();
  const disputesByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM grievances GROUP BY status`).all();

  res.json({ priceTrend, lotsByStatus, demandByCrop, txnByStage, disputesByStatus });
});

router.post("/market-data/sync", requireRole(["admin"]), async (req, res) => {
  try {
    const result = await syncMarketData({ trigger: "admin_ui" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Market data sync failed", detail: err.message });
  }
});

router.get("/market-data/sync-status", async (req, res) => {
  try {
    const status = await getLatestSyncStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sync status", detail: err.message });
  }
});

router.get("/users", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("users").select("id, username, role, display_name, phone, location, created_at").order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const db = getDb();
  res.json(db.prepare("SELECT id, username, role, display_name, phone, location, created_at FROM users ORDER BY created_at DESC").all());
});

router.get("/forecast-runs", async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" && process.env.ALLOW_OFFLINE_DEV !== "true";
  if (isProduction) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: "Production Database Unavailable" });
    try {
      const { data, error } = await supabase.from("forecast_runs").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  const db = getDb();
  res.json(db.prepare("SELECT * FROM forecast_runs ORDER BY created_at DESC LIMIT 20").all());
});

export default router;
