const path = require("path");
const fs = require("fs");
const express = require("express");
const dotenv = require("dotenv");
const { OAuth } = require("mastercard-oauth1-signer");
const forge = require("node-forge");

dotenv.config();

const app = express();
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 3000);

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function readSigningKeyPem() {
  // Prefer direct PEM via env for easy deployments (e.g., GitHub Actions/Secrets).
  const pem = process.env.MASTERCARD_SIGNING_KEY_PEM;
  if (pem && pem.trim()) return pem;

  // Support supplying a .p12 as base64 + password (avoids needing OpenSSL locally).
  const p12b64 = process.env.MASTERCARD_SIGNING_KEY_P12_BASE64;
  if (p12b64 && p12b64.trim()) {
    const password = process.env.MASTERCARD_SIGNING_KEY_P12_PASSWORD || "";
    try {
      const derBytes = forge.util.decode64(p12b64.trim());
      const asn1 = forge.asn1.fromDer(derBytes);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

      // Common: key stored in a "pkcs8ShroudedKeyBag" (encrypted) or "keyBag".
      const bags =
        p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
          forge.pki.oids.pkcs8ShroudedKeyBag
        ] ||
        p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
        [];

      const bag = bags[0];
      if (!bag || !bag.key) {
        throw new Error(
          "Could not find a private key in the provided .p12 (wrong file or password)."
        );
      }
      return forge.pki.privateKeyToPem(bag.key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse MASTERCARD_SIGNING_KEY_P12_BASE64: ${msg}`);
    }
  }

  // Fallback to reading a key from disk for local dev OR "secret files" mounts.
  // This path may point to:
  // - a PEM file (starts with "-----BEGIN")
  // - a PKCS#12 file (.p12/.pfx) which we can parse with MASTERCARD_SIGNING_KEY_P12_PASSWORD
  const p = requiredEnv("MASTERCARD_SIGNING_KEY_PATH");
  const buf = fs.readFileSync(p);
  const maybeText = buf.toString("utf8");
  if (maybeText.trim().startsWith("-----BEGIN")) return maybeText;

  // Not PEM; try PKCS#12
  const password = process.env.MASTERCARD_SIGNING_KEY_P12_PASSWORD || "";
  try {
    const derBytes = forge.util.createBuffer(buf.toString("binary"), "binary")
      .getBytes();
    const asn1 = forge.asn1.fromDer(derBytes);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

    const bags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ||
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
      [];
    const bag = bags[0];
    if (!bag || !bag.key) {
      throw new Error(
        "Could not find a private key in MASTERCARD_SIGNING_KEY_PATH (wrong file or password)."
      );
    }
    return forge.pki.privateKeyToPem(bag.key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse key at MASTERCARD_SIGNING_KEY_PATH: ${msg}`);
  }
}

function getMerchantSearchUrl() {
  return (
    process.env.MASTERCARD_PLACES_MERCHANT_SEARCH_URL ||
    "https://api.mastercard.com/places/v1/merchant"
  );
}

function toNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/merchants", async (req, res) => {
  try {
    const consumerKey = requiredEnv("MASTERCARD_CONSUMER_KEY");
    const signingKey = readSigningKeyPem();

    const latitude = toNumber(req.query.lat, NaN);
    const longitude = toNumber(req.query.lng, NaN);
    const radiusKm = clamp(toNumber(req.query.radiusKm, 2), 0.1, 50);
    const limit = clamp(Math.floor(toNumber(req.query.limit, 25)), 1, 100);
    const name = (req.query.name || "").toString().trim();

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        error: "Missing/invalid lat,lng query params (numbers required).",
      });
    }

    // NOTE: Mastercard Places parameters vary by plan/version.
    // We send the most common geo-search params; override URL via env if needed.
    const url = new URL(getMerchantSearchUrl());
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("radius", String(radiusKm));
    url.searchParams.set("distanceUnit", "KM");
    url.searchParams.set("max", String(limit));
    if (name) url.searchParams.set("name", name);

    const method = "GET";
    const payload = ""; // GET has no body
    const authHeader = OAuth.getAuthorizationHeader(
      url.toString(),
      method,
      payload,
      consumerKey,
      signingKey
    );

    const upstream = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Mastercard Places API request failed.",
        status: upstream.status,
        statusText: upstream.statusText,
        upstream: parsed,
      });
    }

    return res.json({
      request: {
        merchantSearchUrl: url.toString(),
      },
      data: parsed,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error.",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});

