import { db } from "../db.js";

export function ensureStorageCoordinates() {
  const updates = [
    { id: "store-1", lat: 16.3262, lng: 80.6278, verified: 0, source: "SEEDED / DEMO" },
    { id: "store-2", lat: 16.2435, lng: 80.6400, verified: 0, source: "SEEDED / DEMO" },
    { id: "store-3", lat: 16.5160, lng: 80.6300, verified: 0, source: "SEEDED / DEMO" },
    { id: "store-4", lat: 14.4426, lng: 79.9865, verified: 0, source: "SEEDED / DEMO" },
  ];

  const stmt = db.prepare(`
    UPDATE storage_facilities
    SET latitude = ?, longitude = ?, verified = ?, source = ?
    WHERE id = ?
  `);

  for (const u of updates) {
    stmt.run(u.lat, u.lng, u.verified, u.source, u.id);
  }
}

ensureStorageCoordinates();

const rows = db.prepare("SELECT id, name, district, latitude, longitude, verified, source FROM storage_facilities").all();
console.log("All 9 Storage Facilities:");
rows.forEach(r => console.log(` - ${r.id}: ${r.name} [${r.verified ? "VERIFIED" : "SEEDED / DEMO"}] (${r.latitude}, ${r.longitude})`));
