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
- **One** of:
  - `MASTERCARD_SIGNING_KEY_PEM` (recommended for deployments / secrets)
  - `MASTERCARD_SIGNING_KEY_PATH` (local dev: path to a PEM file)

#### Private key format

Most Mastercard projects start with a `.p12` signing key. Convert it to PEM:

```bash
openssl pkcs12 -in "your-key.p12" -nocerts -nodes -out "mastercard-private-key.pem"
```

Then set:

```bash
MASTERCARD_SIGNING_KEY_PATH=/absolute/path/to/mastercard-private-key.pem
```

#### Using GitHub Secrets (deployments)

If you’re deploying via GitHub Actions (or any platform that supports environment variables), add these secrets:
- `MASTERCARD_CONSUMER_KEY`
- One of:
  - `MASTERCARD_SIGNING_KEY_PEM` (paste the full PEM, including the BEGIN/END lines)
  - `MASTERCARD_SIGNING_KEY_P12_BASE64` + `MASTERCARD_SIGNING_KEY_P12_PASSWORD` (if you only have a `.p12`)

If your host supports **secret files** (a file mounted into the container), you can also set:
- `MASTERCARD_SIGNING_KEY_PATH` to the mounted `.p12` path
- `MASTERCARD_SIGNING_KEY_P12_PASSWORD` to the `.p12` password

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

## Deploying to Render (no terminal / using .p12)

If you only have a `.p12` signing key and you don’t want to run OpenSSL:

1. Deploy the repo as a **Render Web Service** (Node).
2. Open your deployed site and visit:
   - `/key-helper.html`
3. Upload your `.p12` to generate `MASTERCARD_SIGNING_KEY_P12_BASE64` (in-browser).
4. In Render → your service → **Environment**, set:
   - `MASTERCARD_CONSUMER_KEY`
   - `MASTERCARD_SIGNING_KEY_P12_BASE64`
   - `MASTERCARD_SIGNING_KEY_P12_PASSWORD`
5. Save changes and let Render redeploy.

## Notes / troubleshooting

- **Secrets stay on the server**: the browser calls `GET /api/merchants`, and the server signs the upstream Mastercard request.
- **Endpoint differences**: Mastercard Places API paths/params can vary by plan/version. If your project uses a different merchant search URL, set:

  - `MASTERCARD_PLACES_MERCHANT_SEARCH_URL` (defaults to `https://api.mastercard.com/places/v1/merchant`)

- If you see an API error in the UI, check:
  - your consumer key + private key match
  - your Mastercard project is enabled for Places API
  - the endpoint URL/params match your API plan

