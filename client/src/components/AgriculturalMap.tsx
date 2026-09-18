import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, Warehouse, Store, Filter, Compass } from "lucide-react";

export interface MapMarkerItem {
  id: string;
  name: string;
  type: "mandi" | "storage" | "farmer";
  district: string;
  state?: string;
  lat: number;
  lng: number;
  priceText?: string;
  capacityText?: string;
  rateText?: string;
  address?: string;
  source?: string;
  distanceKm?: number | null;
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
  height?: string;
}

export default function AgriculturalMap({
  items,
  markets,
  storage,
  center = [16.2974, 80.4578], // Default to Guntur, Andhra Pradesh (Central Agri Hub)
  zoom = 7,
  userLocation = null,
  onSelectMarker,
  onLocationFound,
  height = "420px",
}: AgriculturalMapProps) {
  // Normalize items from items, markets, or storage props
  const normalizedItems: MapMarkerItem[] = [
    ...(items || []),
    ...(markets || []).map((m: any) => ({
      id: m.id || m.marketId,
      name: m.name || m.marketName,
      type: "mandi" as const,
      district: m.district || "",
      state: m.state || "AP",
      lat: m.latitude || m.lat || 16.3067,
      lng: m.longitude || m.lng || 80.4365,
      priceText: m.price ? `₹${m.price}/q` : undefined,
      capacityText: m.arrival_quantity ? `Arrival: ${m.arrival_quantity}q` : undefined,
      source: m.source || "data.gov.in / AGMARKNET",
      address: m.address,
    })),
    ...(storage || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      type: "storage" as const,
      district: s.district || s.location || "",
      lat: s.latitude || s.lat || 16.3067,
      lng: s.longitude || s.lng || 80.4365,
      rateText: s.rate || `₹${s.cost_per_day_per_quintal || 2}/day/q`,
      capacityText: s.capacity || `${s.available_capacity_quintals || 0}q available`,
      source: s.source || (s.verified ? "WDRA Registry" : "SEEDED DEMO"),
      address: s.address,
    })),
  ];

  const parsedUserLocation: [number, number] | null = userLocation
    ? Array.isArray(userLocation)
      ? userLocation
      : [userLocation.lat, userLocation.lng]
    : null;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [filterType, setFilterType] = useState<"all" | "mandi" | "storage">("all");
  const [locating, setLocating] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        scrollWheelZoom: false,
      });

      // Standard OpenStreetMap Tile Layer (Open, free, high quality)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // Custom Icon Generator
    const createCustomIcon = (type: "mandi" | "storage" | "farmer") => {
      let bg = "#0B6E4F";
      let iconHtml = "🏪";
      if (type === "storage") {
        bg = "#0284C7";
        iconHtml = "🏬";
      } else if (type === "farmer") {
        bg = "#F4B942";
        iconHtml = "📍";
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
          <div style="color: #66736B; margin-top: 2px;">Used for calculating approximate road distance to mandis.</div>
        </div>
      `);
    }

    // 2. Add Mandis and Storage Facilities
    const filtered = normalizedItems.filter((item) => {
      if (filterType === "mandi") return item.type === "mandi";
      if (filterType === "storage") return item.type === "storage";
      return true;
    });

    filtered.forEach((item) => {
      if (!item.lat || !item.lng) return;

      const marker = L.marker([item.lat, item.lng], {
        icon: createCustomIcon(item.type),
      }).addTo(layer);

      const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
      const searchUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;

      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; min-width: 200px; color: #17201B;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${item.name}</div>
          <div style="color: #66736B; font-size: 11px;">${item.district}${item.state ? ", " + item.state : ""}</div>
          
          ${item.priceText ? `
            <div style="margin-top: 6px; padding: 4px 8px; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; font-weight: 700; color: #065F46;">
              Modal Price: ${item.priceText}
            </div>` : ""}

          ${item.capacityText ? `
            <div style="margin-top: 6px; padding: 4px 8px; background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; font-weight: 600; color: #0369A1;">
              Available: ${item.capacityText} | Rate: ${item.rateText || "Standard"}
            </div>` : ""}

          ${item.distanceKm != null ? `
            <div style="margin-top: 5px; font-size: 11px; color: #4B5563; font-weight: 600;">
              Approx. Distance: ${item.distanceKm} km
            </div>` : ""}

          ${item.source ? `
            <div style="margin-top: 4px; font-size: 10px; color: #9CA3AF;">
              Source: ${item.source}
            </div>` : ""}

          <div style="margin-top: 8px; display: flex; gap: 6px;">
            <a href="${directionUrl}" target="_blank" rel="noopener noreferrer" style="
              flex: 1;
              text-align: center;
              background: #0B6E4F;
              color: white;
              padding: 4px 8px;
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
              padding: 4px 8px;
              border-radius: 6px;
              text-decoration: none;
              font-size: 11px;
              font-weight: 600;
            ">
              Google Maps
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      if (onSelectMarker) {
        marker.on("click", () => onSelectMarker(item));
      }
    });
  }, [items, userLocation, filterType]);

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
      {/* Controls Bar */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl border border-stone-200 shadow-md">
        <button
          type="button"
          onClick={() => setFilterType("all")}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            filterType === "all" ? "bg-brand-600 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          All ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterType("mandi")}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            filterType === "mandi" ? "bg-emerald-700 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          Mandis
        </button>
        <button
          type="button"
          onClick={() => setFilterType("storage")}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            filterType === "storage" ? "bg-sky-700 text-white shadow-xs" : "text-stone-600 hover:bg-stone-100"
          }`}
        >
          Storage
        </button>
      </div>

      {/* Locate Me Button */}
      <div className="absolute top-3 right-3 z-[1000]">
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-md text-xs font-bold text-brand-800 hover:bg-brand-50 transition-all"
          title="Use GPS location to calculate nearest markets"
        >
          <Compass size={14} className={locating ? "animate-spin text-brand-600" : "text-brand-700"} />
          <span>{locating ? "Locating..." : "Use My Location"}</span>
        </button>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} style={{ height, width: "100%" }} />

      {/* Map Legend */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-stone-200 text-[10px] text-stone-600 flex items-center gap-3 shadow-xs">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span> APMC Mandi
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span> Storage / Warehouse
        </span>
        {userLocation && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> You
          </span>
        )}
      </div>
    </div>
  );
}
