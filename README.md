# SiteFit

**Will this business work here?** SiteFit is a location-feasibility prototype for people deciding where to open a small local business. Choose a business category and a pin; SiteFit compares nearby Google Maps businesses and returns a cautious **YES / MAYBE / NO** with the evidence and sample limitations visible.

> SiteFit is a directional screening tool, not a revenue forecast, pedestrian counter, or guarantee of success. Review totals are lifetime platform activity, not customer counts.

## Hackathon submission overview

- **Project:** SiteFit
- **One-line pitch:** Check a proposed shop location against live local business signals before signing a lease.
- **Problem:** Independent business owners often lack affordable, understandable site-selection research. Enterprise location-intelligence products are generally designed for larger operators, while a manual map search makes it difficult to compare local supply and demand consistently.
- **Approach:** Use SerpApi Google Maps results to compare competitors near a candidate site with a wider local sample. Show business-specific demand-anchor searches, distances, review counts, result coverage, and a transparent directional verdict. Do not infer a headcount from public place data.
- **SerpApi’s role:** Retrieve structured Google Maps local results and account/quota information used to guard uncached searches.
- **Hackathon information:** [SerpApi India Hackathon 2026](https://serpapi.github.io/serpapi-india-hackathon-2026/submit.html?utm_source=india_hackathon_26)
- **Repository:** [kailash16dev/SiteFit](https://github.com/kailash16dev/SiteFit)
- **Demo video / hosted demo:** Add links here when available.

This README covers the project pitch, what is implemented, how to run it, the SerpApi integration, and the prototype’s limits so reviewers can reproduce the current build. Refer to the official hackathon page for the definitive eligibility, deadline, and submission requirements.

## What it does

1. Select a supported business category and search for a locality or place a precise pin. Address suggestions come from SerpApi Google Maps Autocomplete and include selectable coordinates.
2. Query nearby matching businesses and a wider comparison area through SerpApi’s Google Maps engine.
3. For categories configured with demand anchors, also query relevant nearby place types (for example, schools for tuition centres).
4. Compare review volume per outlet, local supply density, anchor evidence, and result coverage using deterministic rules.
5. Display the places, distances, reasons, confidence, and data caveats behind the verdict.

Current categories include tuition/coaching, preschool/daycare, stationery/bookshop, gym, salon, grocery, pharmacy, clinic, café, restaurant, bakery, and mobile/electronics repair.

## Current status and limitations

This is an early prototype. Review-driven categories can produce a directional comparison when both the local and wider samples have adequate coverage. Anchor-based categories currently return a limited **MAYBE** until their Google Maps place-type mappings are verified; queries may be collected, but unverified types are not treated as qualified anchors. Do not treat that output as a final assessment.

Google Maps results are ranked and may be incomplete or capped. Reviews accumulate over time and are affected by visibility and engagement; they are not a direct measure of sales, customers, or current foot traffic. The current SerpApi Maps response does not provide a reliable seven-day pedestrian/busyness history. SiteFit therefore does not claim to count people or show observed street traffic.

The thresholds and category mappings need validation against representative live searches in Indian localities before the result should inform a real investment. A **YES** means the observed signals look relatively favorable under the current heuristic; it is not a prediction that the business will be profitable.

## Technology

- **Frontend:** React 19, Vite, Leaflet, Lucide icons
- **API relay:** Node.js, Express, Zod, Helmet, CORS, dotenv
- **Business data and account limits:** SerpApi Google Maps and Account API
- **Address suggestions:** SerpApi Google Maps Autocomplete API (`engine=google_maps_autocomplete`)
- **Map tiles:** OpenStreetMap
- **Persistence:** Browser localStorage for the user-entered key, search cache, and local scan metadata; no user account or application database
- **AI:** No LLM is used. Verdicts are computed by deterministic, inspectable rules.

The small Node.js relay keeps the SerpApi call out of the browser’s cross-origin path, validates requests, and checks the account’s plan and hourly search allowance before sending uncached Maps searches. It does not save the client token or search requests. Cached responses are stored on the browser and can avoid repeat API searches.

## Requirements

- Node.js 20 or newer
- npm
- A SerpApi account and API key for live searches
- Network access to the local API, SerpApi, and OpenStreetMap tile servers

## Run locally

```bash
git clone https://github.com/kailash16dev/SiteFit.git
cd SiteFit
npm install
cp apps/api/.env.example apps/api/.env
```

Set `WEB_ORIGIN=http://localhost:5173` in `apps/api/.env`, then choose one of these local testing options:

**Option A — local server key (convenient for this development machine):** Set `SERPAPI_API_KEY` in `apps/api/.env`. The key is read only by the Node API in non-production mode. The frontend receives only a boolean indicating that a local key is configured; the key itself is never sent to the browser. A key supplied in the browser’s Settings takes precedence.

**Option B — browser-provided key:** Leave `SERPAPI_API_KEY` blank, start the app, enter your own key in **Settings**, and save it. It is stored in that browser’s localStorage and sent to the relay per request.

Start both apps from the repository root:

```bash
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:8787>; Vite proxies `/api` requests to it. The API’s local-server-key fallback is disabled when `NODE_ENV=production`.

To build and check the project:

```bash
npm run build
```

## SerpApi request and quota behavior

- Address suggestions call SerpApi `engine=google_maps_autocomplete`; selecting a place uses its returned latitude and longitude. A broad India map center biases initial suggestions; place-specific pin context can be added in a later iteration.
- Feasibility searches call `engine=google_maps` through the API relay; the key is not embedded in frontend code.
- Before each uncached autocomplete or Maps search, the relay checks SerpApi’s Account API for `plan_searches_left` and hourly capacity. Each uncached autocomplete query uses one search from the same allowance. Repeated identical address queries can use a 24-hour cache in that browser. If the required fields are missing or the allowance is insufficient, the Maps batch is not sent.
- The gate uses plan searches remaining, not `total_searches_left`, which may include separate credits. The Account API check itself does not consume a Maps search.
- Requests from SiteFit using the same key are serialized in-process to avoid simultaneous scans passing the same quota check. SerpApi remains authoritative if the key is also used elsewhere.
- Local browser cache hits do not call the Maps search endpoint. Search inputs and results are not stored by the API relay.

## Privacy and key handling

- Never commit `.env`, a real SerpApi key, or a key in frontend source.
- `.env` and `.env.*` are ignored; `.env.example` is safe to commit and contains no real key.
- The local server key is a development convenience only. Do not set it in a deployed environment; production requests must provide a user key in the request header.
- SiteFit has no accounts, server-side search history, or database.
- Clearing the browser cache removes locally cached search results. Clearing the token in Settings removes the browser-stored key.

## Hackathon demo checklist

Before submitting, add or verify:

- A short end-to-end demo video showing category selection, pin selection, analysis, and the evidence-backed result.
- A hosted demo link if the project is deployed.
- A clean installation and build from a fresh clone.
- A valid, private SerpApi key supplied through a local environment or browser Settings; do not put keys in the repository or video.
- Any team, eligibility, or form fields required by the official submission page.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite frontend together |
| `npm run build` | Build the frontend and syntax-check the API |
| `npm run start` | Start the API relay |

## License

No license has been selected yet. All rights are reserved unless and until a license is added.
