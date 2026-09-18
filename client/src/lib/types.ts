export type Role = "farmer" | "fpo" | "buyer" | "admin";

export interface User {
  id: string;
  username: string;
  role: Role;
  display_name: string;
  phone?: string;
  location?: string;
}

export interface Crop {
  id: string;
  name: string;
  unit: string;
  category: string;
}

export interface MarketOption {
  marketId: string;
  marketName: string;
  district: string;
  currentPrice: number;
  trend7DayAvg: number | null;
  trend7DayChangePct: number | null;
  trend30DayAvg: number | null;
  volatilityPct: number;
  arrivalQtyQuintals: number | null;
  distanceKm: number;
  transportCostPerQuintal: number;
  marketChargesPerQuintal: number;
  netRealizationPerQuintal: number;
  demandLevel: "Low" | "Medium" | "High";
  recommendationScore: number;
  scoreComponents: {
    priceScore: number;
    logisticsScore: number;
    demandScore: number;
    qualityScore: number;
    timingScore: number;
  };
  reasons: string[];
  minPrice?: number;
  maxPrice?: number;
  source?: string;
  sourceUrl?: string;
  dataStatus?: "LIVE" | "UPDATED" | "ESTIMATED" | "FORECAST" | "SEEDED";
  updatedAt?: string;
}

export interface Lot {
  id: string;
  owner_type: "farmer" | "fpo";
  owner_id: string;
  crop_id: string;
  crop_name?: string;
  variety?: string;
  quantity_quintals: number;
  grade?: string;
  location: string;
  district: string;
  harvest_date?: string;
  available_from?: string;
  expected_price?: number;
  min_acceptable_price?: number;
  storage_available: number;
  status: string;
  is_aggregated: number;
  created_at: string;
}

export interface BuyerMatch {
  demandId: string;
  buyerId: string;
  buyerName: string;
  buyerType: string;
  verified: boolean;
  paymentReliabilityPct: number;
  responseRatePct: number;
  transactionsCompleted: number;
  requiredQuantity: number;
  gradeRequired: string;
  offerPrice: number;
  requiredBy: string;
  distanceKm: number;
  matchScorePct: number;
  scoreComponents: Record<string, number>;
  reasons: string[];
}
