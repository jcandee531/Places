/* global L */

const DEFAULT_CENTER = { lat: 40.741, lng: -73.989 }; // Manhattan-ish

const el = {
  radius: document.getElementById("radius"),
  radiusValue: document.getElementById("radiusValue"),
  limit: document.getElementById("limit"),
  name: document.getElementById("name"),
  search: document.getElementById("search"),
  useLocation: document.getElementById("useLocation"),
  status: document.getElementById("status"),
  resultsMeta: document.getElementById("resultsMeta"),
  resultsList: document.getElementById("resultsList"),
  raw: document.getElementById("raw"),
};

function setStatus(msg) {
  el.status.textContent = msg;
}

function fmtKm(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(n < 10 ? 2 : 1)} km`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pick(obj, paths) {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur != null) return cur;
  }
  return undefined;
}

function normalizeMerchant(m) {
  const name = pick(m, ["name", "merchantName", "merchant_name"]) || "Merchant";
  const lat = Number(
    pick(m, ["location.latitude", "latitude", "lat", "geo.latitude"])
  );
  const lng = Number(
    pick(m, ["location.longitude", "longitude", "lng", "geo.longitude"])
  );
  const distance = Number(pick(m, ["distance", "distanceKm", "dist"])) || null;

  const a = pick(m, ["address", "merchantAddress", "location.address"]) || {};
  const lines = [
    pick(a, ["line1", "addressLine1", "street"]),
    pick(a, ["city"]),
    pick(a, ["region", "state", "stateProvince"]),
    pick(a, ["postalCode", "zip"]),
    pick(a, ["country", "countryCode"]),
  ].filter(Boolean);

  return {
    raw: m,
    name: String(name),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    distanceKm: Number.isFinite(distance) ? distance : null,
    address: lines.join(", "),
  };
}

function extractMerchants(apiData) {
  // Handles a few common response shapes.
  const candidates = [
    apiData?.merchant,
    apiData?.merchants,
    apiData?.data?.merchant,
    apiData?.data?.merchants,
    apiData?.data,
    apiData?.items,
    apiData?.results,
  ].filter(Boolean);

  for (const c of candidates) {
    if (Array.isArray(c)) return c.map(normalizeMerchant);
  }

  // Sometimes the API returns a single object.
  if (apiData && typeof apiData === "object") {
    const maybe = apiData?.merchant || apiData?.merchants;
    if (maybe && typeof maybe === "object") return [normalizeMerchant(maybe)];
  }

  return [];
}

function mapsLink(lat, lng) {
  const q = encodeURIComponent(`${lat},${lng}`);
  return `https://www.google.com/maps?q=${q}`;
}

let map;
let centerMarker;
let radiusCircle;
let merchantLayer;
let currentCenter = { ...DEFAULT_CENTER };

function setCenter(lat, lng, zoomTo = true) {
  currentCenter = { lat, lng };
  centerMarker.setLatLng([lat, lng]);
  radiusCircle.setLatLng([lat, lng]);
  if (zoomTo) map.setView([lat, lng], Math.max(map.getZoom(), 13));
}

function setRadiusKm(km) {
  el.radiusValue.textContent = `${km.toFixed(1)} km`;
  radiusCircle.setRadius(km * 1000);
}

function clearMerchants() {
  merchantLayer.clearLayers();
  el.resultsList.innerHTML = "";
  el.resultsMeta.textContent = "";
}

function renderMerchants(list) {
  clearMerchants();

  el.resultsMeta.textContent = `${list.length} result${
    list.length === 1 ? "" : "s"
  }`;

  for (const m of list) {
    const card = document.createElement("div");
    card.className = "card";

    const dist = m.distanceKm == null ? "" : fmtKm(m.distanceKm);
    const hasCoords = m.lat != null && m.lng != null;

    card.innerHTML = `
      <div class="cardTop">
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="dist">${escapeHtml(dist)}</div>
      </div>
      <div class="addr">${escapeHtml(m.address || "")}</div>
      <div class="cardActions">
        ${
          hasCoords
            ? `<a class="link" href="${mapsLink(m.lat, m.lng)}" target="_blank" rel="noreferrer">Open in Maps</a>`
            : ""
        }
        <a class="link" href="#" data-action="zoom">Zoom</a>
      </div>
    `;

    card.querySelector('[data-action="zoom"]').addEventListener("click", (e) => {
      e.preventDefault();
      if (!hasCoords) return;
      map.setView([m.lat, m.lng], 16);
    });

    el.resultsList.appendChild(card);

    if (hasCoords) {
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 6,
        color: "#ffc400",
        weight: 2,
        fillColor: "#ff5f00",
        fillOpacity: 0.35,
      }).bindPopup(
        `<strong>${escapeHtml(m.name)}</strong><br/>${escapeHtml(
          m.address || ""
        )}`
      );
      merchantLayer.addLayer(marker);
    }
  }
}

async function searchMerchants() {
  const radiusKm = Number(el.radius.value);
  const limit = Number(el.limit.value);
  const name = el.name.value.trim();

  const params = new URLSearchParams({
    lat: String(currentCenter.lat),
    lng: String(currentCenter.lng),
    radiusKm: String(radiusKm),
    limit: String(limit),
  });
  if (name) params.set("name", name);

  const url = `/api/merchants?${params.toString()}`;

  el.search.disabled = true;
  setStatus("Searching…");

  try {
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    el.raw.textContent = JSON.stringify(body, null, 2);

    if (!r.ok) {
      setStatus(
        `API error (${r.status}). Check server logs / credentials / endpoint.`
      );
      clearMerchants();
      return;
    }

    const merchants = extractMerchants(body?.data);
    renderMerchants(merchants);
    setStatus("Done.");
  } catch (err) {
    clearMerchants();
    el.raw.textContent = String(err);
    setStatus("Network error. Is the server running?");
  } finally {
    el.search.disabled = false;
  }
}

function init() {
  // Defaults
  el.radius.value = "2.0";
  el.limit.value = "25";
  setRadiusKm(Number(el.radius.value));

  el.radius.addEventListener("input", () => {
    setRadiusKm(Number(el.radius.value));
  });

  el.search.addEventListener("click", () => {
    searchMerchants();
  });

  el.useLocation.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported by your browser.");
      return;
    }
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter(pos.coords.latitude, pos.coords.longitude, true);
        setStatus("Location updated. Click Search.");
      },
      () => {
        setStatus("Could not get location (permission denied or unavailable).");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  map = L.map("map", {
    zoomControl: true,
  }).setView([currentCenter.lat, currentCenter.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  }).addTo(map);

  centerMarker = L.marker([currentCenter.lat, currentCenter.lng], {
    draggable: true,
  }).addTo(map);

  radiusCircle = L.circle([currentCenter.lat, currentCenter.lng], {
    radius: Number(el.radius.value) * 1000,
    color: "#ff5f00",
    weight: 2,
    fillColor: "#ff5f00",
    fillOpacity: 0.08,
  }).addTo(map);

  merchantLayer = L.layerGroup().addTo(map);

  centerMarker.on("dragend", () => {
    const p = centerMarker.getLatLng();
    setCenter(p.lat, p.lng, false);
    setStatus("Center moved. Click Search.");
  });

  map.on("click", (e) => {
    setCenter(e.latlng.lat, e.latlng.lng, false);
    setStatus("Center updated. Click Search.");
  });
}

window.addEventListener("DOMContentLoaded", init);

