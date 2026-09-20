import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, Warehouse, Store, Filter, Compass, Search, Users, AlertCircle } from "lucide-react";

export interface MapMarkerItem {
  id: string;
  name: string;
  type: "mandi" | "storage" | "farmer" | "fpo";
  district: string;
  state?: string;
  lat: number;
  lng: number;
  priceText?: string;
  minPrice?: number;
  maxPrice?: number;
  capacityText?: string;
  rateText?: string;
  address?: string;
  source?: string;
  distanceKm?: number | null;
  pincode?: string;
}

interface AgriculturalMapProps {
  items?: MapMarkerItem[];
  markets?: any[];
  storage?: any[];
  center?: [number, number];
  zoom?: number;
  userLocation?: [number, number] | { lat: number; lng: number } | null;
  onSelectMarker?: (item: MapMarkerItem) => void;
  onLocationFound?: (lat: number, lng: number) => void;
  onFindStorageNearMarket?: (market: MapMarkerItem) => void;
  height?: string;
}

// Haversine calculation for client-side filtering
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export default function AgriculturalMap({
  items,
  markets,
  storage,
  center = [16.2974, 80.4578], // Guntur, Andhra Pradesh (Central Agri Hub)
  zoom = 7,
  userLocation = null,
  onSelectMarker,
  onLocationFound,
  onFindStorageNearMarket,
  height = "450px",
}: AgriculturalMapProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "mandi" | "storage" | "fpo" | "nearby">("all");
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const parsedUserLocation: [number, number] | null = useMemo(() => {
    if (!userLocation) return null;
    return Array.isArray(userLocation) ? userLocation : [userLocation.lat, userLocation.lng];
  }, [userLocation]);

  // Normalize items from items, markets, or storage props
  const normalizedItems: MapMarkerItem[] = useMemo(() => {
    function isValidCoord(lat: any, lng: any): boolean {
      if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
      const nLat = Number(lat);
      const nLng = Number(lng);
      if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
      if (nLat < -90 || nLat > 90) return false;
      if (nLng < -180 || nLng > 180) return false;
      if (nLat === 0 && nLng === 0) return false;
      return true;
    }

    const list: MapMarkerItem[] = [];

    // 1. Direct items
    for (const it of (items || [])) {
      if (isValidCoord(it.lat, it.lng)) {
        list.push(it);
      }
    }

    // 2. Markets
    for (const m of (markets || [])) {
      const lat = m.latitude !== undefined ? m.latitude : m.lat;
      const lng = m.longitude !== undefined ? m.longitude : m.lng;
      if (!isValidCoord(lat, lng)) continue;

      const numLat = Number(lat);
      const numLng = Number(lng);
      const dist = parsedUserLocation
        ? calculateDistanceKm(parsedUserLocation[0], parsedUserLocation[1], numLat, numLng)
        : m.distanceKm;

      list.push({
        id: m.id || m.marketId,
        name: m.name || m.marketName,
        type: "mandi" as const,
        district: m.district || "",
        state: m.state || "AP",
        lat: numLat,
        lng: numLng,
        priceText: m.price ? `₹${m.price}/q` : undefined,
        minPrice: m.minPrice,
        maxPrice: m.maxPrice,
        capacityText: m.arrival_quantity ? `Arrival: ${m.arrival_quantity}q` : undefined,
        source: m.source || "data.gov.in / AGMARKNET",
        address: m.address,
        pincode: m.pincode,
        distanceKm: dist,
      });
    }

    // 3. Storage
    for (const s of (storage || [])) {
      const lat = s.latitude !== undefined ? s.latitude : s.lat;
      const lng = s.longitude !== undefined ? s.longitude : s.lng;
      if (!isValidCoord(lat, lng)) continue;

      const numLat = Number(lat);
      const numLng = Number(lng);
      const dist = parsedUserLocation
        ? calculateDistanceKm(parsedUserLocation[0], parsedUserLocation[1], numLat, numLng)
        : s.distance_km;

      list.push({
        id: s.id,
        name: s.name,
        type: "storage" as const,
        district: s.district || s.location || "",
        lat: numLat,
        lng: numLng,
        rateText: s.rate || `₹${s.cost_per_day_per_quintal || 2}/day/q`,
        capacityText: s.capacity || `${s.available_capacity_quintals || 0}q space`,
        source: s.source || (s.verified ? "WDRA Registry" : "SEEDED DEMO"),
        address: s.address,
        pincode: s.pincode,
        distanceKm: dist,
      });
    }

    return list;
  }, [items, markets, storage, parsedUserLocation]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center,
          zoom,
          scrollWheelZoom: false,
        });

        // OpenStreetMap Tile Layer with fallback & proper attribution
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | KisanSetu GIS',
          maxZoom: 18,
        }).addTo(map);

        markersLayerRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
      }
    } catch (err: any) {
      console.warn("Leaflet initialization error:", err);
      setMapError("Interactive map could not load. Coordinates and table views remain fully functional.");
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers with Search & Filters
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // Custom Icon Generator for Leaflet
    const createCustomIcon = (type: "mandi" | "storage" | "farmer" | "fpo") => {
      let bg = "#0B6E4F";
      let iconHtml = "🏪";
      if (type === "storage") {
        bg = "#0284C7";
        iconHtml = "🏬";
      } else if (type === "farmer") {
        bg = "#F4B942";
        iconHtml = "📍";
      } else if (type === "fpo") {
        bg = "#7C3AED";
        iconHtml = "👥";
      }

      return L.divIcon({
        className: "custom-leaflet-marker",
        html: `
          <div style="
            background: ${bg};
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            cursor: pointer;
          ">
            ${iconHtml}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
    };

    // 1. Add User Marker if available
    if (parsedUserLocation) {
      const userMarker = L.marker(parsedUserLocation, {
        icon: createCustomIcon("farmer"),
      }).addTo(layer);
      userMarker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
          <div style="font-weight: bold; color: #17201B; font-size: 13px;">📍 Your Location</div>
          <div style="color: #66736B; margin-top: 2px;">Used for calculating straight-line (Haversine) distance to markets.</div>
        </div>
      `);
    }

    // 2. Filter items based on type, search query, and nearby
    const filtered = normalizedItems.filter((item) => {
      // Type filter
      if (filterType === "mandi" && item.type !== "mandi") return false;
      if (filterType === "storage" && item.type !== "storage") return false;
      if (filterType === "fpo" && item.type !== "fpo") return false;
      if (filterType === "nearby") {
        if (!item.distanceKm || item.distanceKm > 60) return false;
      }

      // Search query filter (name, district, state)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDistrict = item.district.toLowerCase().includes(q);
        const matchesState = (item.state || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDistrict && !matchesState) return false;
      }

      return true;
    });

    filtered.forEach((item) => {
      if (!item.lat || !item.lng) return;

      const marker = L.marker([item.lat, item.lng], {
        icon: createCustomIcon(item.type),
      }).addTo(layer);

      // Directions: External link to Google Maps (ZERO JS API key required)
      const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
      const searchUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;

      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; min-width: 220px; color: #17201B; line-height: 1.4;">
          <div style="font-weight: 700; font-size: 14px; color: #0B6E4F;">${item.name}</div>
          <div style="color: #66736B; font-size: 11px; margin-top: 2px;">
            ${item.address ? item.address + ", " : ""}${item.district}${item.state ? ", " + item.state : ""}
            ${item.pincode ? " - " + item.pincode : ""}
          </div>
          
          ${item.priceText ? `
            <div style="margin-top: 6px; padding: 5px 8px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; font-weight: 700; color: #065F46;">
              Modal Price: ${item.priceText}
              ${item.minPrice && item.maxPrice ? `<div style="font-size: 10px; font-weight: normal; color: #047857;">Range: ₹${item.minPrice} - ₹${item.maxPrice}/q</div>` : ""}
            </div>` : ""}

          ${item.capacityText ? `
            <div style="margin-top: 6px; padding: 5px 8px; background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; font-weight: 600; color: #0369A1;">
              ${item.capacityText} ${item.rateText ? "| Fee: " + item.rateText : ""}
            </div>` : ""}

          ${item.distanceKm != null ? `
            <div style="margin-top: 5px; font-size: 11px; color: #374151; font-weight: 600;">
              Straight-line distance: ${item.distanceKm} km
            </div>` : ""}

          ${item.source ? `
            <div style="margin-top: 4px; font-size: 10px; color: #6B7280;">
              Source: ${item.source}
            </div>` : ""}

          <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
            <a href="${directionUrl}" target="_blank" rel="noopener noreferrer" style="
              flex: 1;
              text-align: center;
              background: #0B6E4F;
              color: white;
              padding: 5px 8px;
              border-radius: 6px;
              text-decoration: none;
              font-size: 11px;
              font-weight: 600;
            ">
              🧭 Directions
            </a>
            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" style="
              background: #F3F4F6;
              color: #374151;
              padding: 5px 8px;
              border-radius: 6px;
              text-decoration: none;
              font-size: 11px;
              font-weight: 600;
            ">
              🗺️ Open in Google Maps
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      if (onSelectMarker) {
        marker.on("click", () => onSelectMarker(item));
      }
    });
  }, [normalizedItems, parsedUserLocation, filterType, searchQuery]);

  // Geolocation trigger
  function handleLocateMe() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 9);
        }
        if (onLocationFound) {
          onLocationFound(latitude, longitude);
        }
      },
      (err) => {
        setLocating(false);
        console.warn("Location permission denied or error:", err.message);
        alert("Location access denied. You can manually choose your district in the filter.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-brand-100 shadow-sm bg-white">
      {/* Top Search & Controls Bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Search Bar & Layer Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl border border-stone-200 shadow-md pointer-events-auto">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search market, storage, district..."
              className="pl-8 pr-2 py-1 text-xs border border-stone-200 rounded-lg w-40 sm:w-56 focus:outline-none focus:border-brand-500 bg-stone-50"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterType === "all" ? "bg-brand-600 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              All ({normalizedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("mandi")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterType === "mandi" ? "bg-emerald-700 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              Mandis
            </button>
            <button
              type="button"
              onClick={() => setFilterType("storage")}
              className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                filterType === "storage" ? "bg-sky-700 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              Storage
            </button>
            {parsedUserLocation && (
              <button
                type="button"
                onClick={() => setFilterType("nearby")}
                className={`px-2 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterType === "nearby" ? "bg-amber-600 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                Nearby (&lt;60km)
              </button>
            )}
          </div>
        </div>

        {/* Locate Me Button */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-md text-xs font-bold text-brand-800 hover:bg-brand-50 transition-all"
            title="Use GPS location to calculate nearest markets"
          >
            <Compass size={14} className={locating ? "animate-spin text-brand-600" : "text-brand-700"} />
            <span>{locating ? "Locating..." : parsedUserLocation ? "Location Set" : "Use My Location"}</span>
          </button>
        </div>
      </div>

      {/* Map Error Fallback */}
      {mapError && (
        <div className="p-4 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-600" />
          <span>{mapError}</span>
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainerRef} style={{ height, width: "100%" }} />

      {/* Map Legend */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-stone-200 text-[10px] text-stone-600 flex items-center gap-3 shadow-xs">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span> APMC Mandi
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span> Storage Hub
        </span>
        {parsedUserLocation && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> You
          </span>
        )}
      </div>
    </div>
  );
}
