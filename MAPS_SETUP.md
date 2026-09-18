# KisanSetu — Geolocation & Maps Integration Guide

This guide details the geographic location intelligence, distance calculation methodology, storage recommendations, and interactive map implementation in KisanSetu.

---

## 1. Map Architecture & Cost-Conscious Design

KisanSetu implements a **low-cost fallback architecture** designed to prevent costly Google Maps API billing or outages from locking farmers out of the application:

1. **Default Free Map Layer**: Powered by **Leaflet** with standard **OpenStreetMap** tile layers. Zero API keys required; 100% functional out-of-the-box.
2. **Optional Google Maps Enhancement**: If `VITE_GOOGLE_MAPS_API_KEY` is provided in the client environment, enhanced Google Maps Platform capabilities (traffic, satellite view, precise Places API) are activated.
3. **Directions & Routing**: External navigation links open Google Maps with precise coordinates (`https://www.google.com/maps/search/?api=1&query=lat,lng`), providing farmers turn-by-turn road navigation without consuming paid Directions API quotas.

---

## 2. Geolocation Database

### Mandis (`markets` table):
- Every APMC market contains verified geographic coordinates:
  - `latitude` (FLOAT, e.g. `16.3067` for Guntur APMC)
  - `longitude` (FLOAT, e.g. `80.4365` for Guntur APMC)
  - `address`, `district`, `state`, `pincode`
  - `location_source`: `Verified APMC / Official Coordinates`
- If coordinates for a regional sub-yard are unavailable, coordinates are marked `NULL` and labeled as unavailable; coordinates are **never fabricated**.

### Storage Facilities (`storage_facilities` table):
- Cold storages and warehouses include:
  - `type`: Cold Storage, Warehouse, Grain Storage, Silo, Packhouse
  - `latitude` & `longitude`
  - `temperature_controlled`: BOOLEAN (e.g. 2°C - 8°C cold rooms)
  - `capacity_quintals` & `available_capacity_quintals`
  - `cost_per_day_per_quintal`
  - `source`: WDRA Registry or clearly marked `SEEDED DEMO DATA`

---

## 3. Distance Calculation (Haversine Formula)

Distance between the farmer's location and regional mandis or storage hubs is computed using the **Haversine Formula**:

$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1) \cdot \cos(\phi_2) \cdot \sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$
$$d = R \cdot c \quad (\text{where } R = 6,371 \text{ km})$$

In the UI, this is **always explicitly labeled as**:
> **"Approx. distance"** (Straight-line estimation)

Straight-line distance is never falsely presented as road mileage.

---

## 4. Farmer Location Workflow

1. **Privacy-First Permission**: Location permission is **never requested aggressively upon initial page load**.
2. **"Find Nearest (GPS)"**: When tapped by the user, the browser's `navigator.geolocation.getCurrentPosition` obtains device latitude/longitude.
3. **Manual Fallback**: If GPS permission is denied or unavailable, farmers can manually select their District from the dropdown.

---

## 5. Storage Recommendation Near Mandi

Under Market Comparison and Storage pages:
- Farmers can tap **"Storage Near Market"** or **"Find Storage"** to automatically discover cold storages and warehouses situated within 50 km of the selected APMC yard.
- Transparent net realization accounts for:
  $$\text{Net Realization} = (\text{Quantity} \times \text{Modal Price}) - \text{Transport Cost} - \text{Storage / Cess}$$
