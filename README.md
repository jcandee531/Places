# Places

Simple, low-noise website that helps users locate nearby merchants that accept Mastercard, powered by the **Mastercard Places API**.

This repo includes:
- A tiny **Node/Express** server that securely signs Mastercard API requests (OAuth 1.0a).
- A static frontend (no build step) with a **map + radius search + merchant list**.

## Quick start

### 1) Install

```bash
npm install
```

### 2) Configure credentials

Copy the example env file:

```bash
cp .env.example .env
```

Fill in:
- `MASTERCARD_CONSUMER_KEY`
- `MASTERCARD_SIGNING_KEY_PATH` (a **PEM** private key used for OAuth signing)

#### Private key format

Most Mastercard projects start with a `.p12` signing key. Convert it to PEM:

```bash
openssl pkcs12 -in "your-key.p12" -nocerts -nodes -out "mastercard-private-key.pem"
```

Then set:

```bash
MASTERCARD_SIGNING_KEY_PATH=/absolute/path/to/mastercard-private-key.pem
```

### 3) Run

```bash
npm start
```

Open:
- `http://localhost:3000`

## Using the app

- Click the map (or drag the center marker) to choose a search location
- Adjust radius and max results
- Click **Search**

## Notes / troubleshooting

- **Secrets stay on the server**: the browser calls `GET /api/merchants`, and the server signs the upstream Mastercard request.
- **Endpoint differences**: Mastercard Places API paths/params can vary by plan/version. If your project uses a different merchant search URL, set:

  - `MASTERCARD_PLACES_MERCHANT_SEARCH_URL` (defaults to `https://api.mastercard.com/places/v1/merchant`)

- If you see an API error in the UI, check:
  - your consumer key + private key match
  - your Mastercard project is enabled for Places API
  - the endpoint URL/params match your API plan

