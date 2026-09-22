import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createOriginChecker } from './cors.js';
import { GROQ_MODEL, buildSummaryPrompt, parseSummaryContext, validateSummaryText } from './summary.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const isAllowedOrigin = createOriginChecker(process.env.WEB_ORIGIN);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin) ? origin : false), methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'X-Serpapi-Token', 'X-Groq-Api-Key'] }));
app.use(express.json({ limit: '16kb' }));

const tokenFrom = req => {
  const token = req.get('X-Serpapi-Token')?.trim();
  return token && token.length <= 256 ? token : null;
};
const groqTokenFrom = req => {
  const token = req.get('X-Groq-Api-Key')?.trim();
  return token && token.length <= 512 ? token : null;
};
const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const mapsSchema = z.object({
  q: z.string().trim().min(2).max(100),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  m: z.number().int().min(100).max(50000),
  type: z.literal('search').default('search'),
  hl: z.string().length(2).default('en'),
  gl: z.string().length(2).default('in'),
  start: z.number().int().min(0).max(60).optional()
}).strict();
const mapsBatchSchema = z.object({ searches: z.array(mapsSchema).min(1).max(5) }).strict();
const autocompleteSchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.number().finite().min(-90).max(90).optional(),
  lon: z.number().finite().min(-180).max(180).optional()
}).strict().refine(value => (value.lat === undefined) === (value.lon === undefined));

async function getAccount(token) {
  const upstream = new URL('https://serpapi.com/account.json');
  upstream.searchParams.set('api_key', token);
  const response = await fetch(upstream, { signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error || 'Could not validate this token.');
    error.status = response.status;
    error.code = response.status === 401 ? 'INVALID_TOKEN' : 'SERPAPI_ERROR';
    throw error;
  }
  const hourlyLimit = Number.isFinite(payload.account_rate_limit_per_hour) ? payload.account_rate_limit_per_hour : null;
  const usedThisHour = Number.isFinite(payload.this_hour_searches) ? payload.this_hour_searches : null;
  return {
    plan_name: payload.plan_name ?? null,
    monthly_search_limit: Number.isFinite(payload.searches_per_month) ? payload.searches_per_month : null,
    plan_searches_left: Number.isFinite(payload.plan_searches_left) ? payload.plan_searches_left : null,
    total_searches_left: Number.isFinite(payload.total_searches_left) ? payload.total_searches_left : null,
    renewal_date: payload.plan_renewal_date ?? null,
    hourly_search_limit: hourlyLimit,
    searches_this_hour: usedThisHour,
    hourly_searches_left: hourlyLimit !== null && usedThisHour !== null ? Math.max(0, hourlyLimit - usedThisHour) : null
  };
}

async function searchMaps(token, params) {
  const upstream = new URL('https://serpapi.com/search');
  upstream.searchParams.set('engine', 'google_maps');
  for (const [key, value] of Object.entries(params)) upstream.searchParams.set(key, String(value));
  upstream.searchParams.set('api_key', token);
  const response = await fetch(upstream, { signal: AbortSignal.timeout(25000) });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error || 'SerpApi could not complete this search.');
    error.status = response.status;
    error.code = response.status === 429 ? 'SERPAPI_QUOTA_OR_RATE_LIMIT' : response.status === 401 ? 'INVALID_TOKEN' : 'SERPAPI_ERROR';
    throw error;
  }
  return payload;
}

async function searchMapsAutocomplete(token, query, lat, lon) {
  const upstream = new URL('https://serpapi.com/search');
  upstream.searchParams.set('engine', 'google_maps_autocomplete');
  upstream.searchParams.set('q', query);
  upstream.searchParams.set('ll', lat === undefined ? '@20.5937,78.9629,5z' : `@${lat},${lon},14z`);
  upstream.searchParams.set('gl', 'in');
  upstream.searchParams.set('hl', 'en');
  upstream.searchParams.set('api_key', token);
  const response = await fetch(upstream, { signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error || 'Google Maps address suggestions are unavailable.');
    error.status = response.status;
    error.code = response.status === 429 ? 'SERPAPI_QUOTA_OR_RATE_LIMIT' : response.status === 401 ? 'INVALID_TOKEN' : 'SERPAPI_ERROR';
    throw error;
  }
  return (payload.suggestions || []).filter(item => item.type === 'place' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).slice(0, 8).map(item => ({
    label: [item.value, item.subtext].filter(Boolean).join(', '),
    lat: item.latitude,
    lon: item.longitude
  }));
}

async function summarizeWithGroq(token, context) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: buildSummaryPrompt(context) }],
      reasoning_effort: 'low',
      max_tokens: 256,
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(12000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Groq could not write the explanation.');
    error.status = response.status;
    error.code = response.status === 401 ? 'INVALID_GROQ_TOKEN' : 'GROQ_UNAVAILABLE';
    throw error;
  }
  const summary = validateSummaryText(payload?.choices?.[0]?.message?.content, context);
  if (!summary) {
    const error = new Error('Groq returned an explanation that could not be verified.');
    error.status = 422;
    error.code = 'INVALID_SUMMARY';
    throw error;
  }
  return summary;
}

// Serialize scans using a one-way token fingerprint; never retain the raw key.
const tokenQueues = new Map();
async function serializeByToken(token, task) {
  const key = createHash('sha256').update(token).digest('hex');
  const previous = tokenQueues.get(key) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  tokenQueues.set(key, queued);
  await previous;
  try { return await task(); }
  finally {
    release();
    if (tokenQueues.get(key) === queued) tokenQueues.delete(key);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/api/v1/maps/batch', async (req, res) => {
  const token = tokenFrom(req);
  if (!token) return fail(res, 401, 'TOKEN_REQUIRED', 'Add a valid SerpApi token in Settings.');
  const parsed = mapsBatchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'INVALID_SEARCH_BATCH', 'The Maps searches are invalid.');
  try {
    const results = await serializeByToken(token, async () => {
      const quota = await getAccount(token);
      const required = parsed.data.searches.length;
      if (quota.plan_searches_left === null || quota.hourly_searches_left === null) {
        const error = new Error('SerpApi did not return the quota fields needed to protect this account. No Maps searches were sent.');
        error.status = 503; error.code = 'QUOTA_UNAVAILABLE'; throw error;
      }
      if (quota.plan_searches_left < required) {
        const error = new Error(`This scan needs ${required} Maps searches, but only ${quota.plan_searches_left} plan searches remain. No Maps searches were sent.`);
        error.status = 429; error.code = 'PLAN_QUOTA_TOO_LOW'; throw error;
      }
      if (quota.hourly_searches_left < required) {
        const error = new Error(`This scan needs ${required} Maps searches, but only ${quota.hourly_searches_left} remain in the current hourly limit. No Maps searches were sent.`);
        error.status = 429; error.code = 'HOURLY_LIMIT_TOO_LOW'; throw error;
      }
      const output = [];
      for (const search of parsed.data.searches) {
        try { output.push(await searchMaps(token, search)); }
        catch (error) { error.partialResults = output; throw error; }
      }
      return output;
    });
    return res.json({ results });
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({
      error: { code: error.code || 'UPSTREAM_UNAVAILABLE', message: error?.name === 'TimeoutError' ? 'SerpApi request timed out. Retry the search.' : error.message || 'SerpApi is temporarily unavailable.' },
      partialResults: error.partialResults || []
    });
  }
});

app.post('/api/v1/maps/autocomplete', async (req, res) => {
  const token = tokenFrom(req);
  if (!token) return fail(res, 401, 'TOKEN_REQUIRED', 'Add a valid SerpApi token in Settings.');
  const parsed = autocompleteSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'INVALID_ADDRESS_QUERY', 'Enter at least two characters for the address search.');
  try {
    const suggestions = await serializeByToken(token, async () => {
      const quota = await getAccount(token);
      if (quota.plan_searches_left === null || quota.hourly_searches_left === null) {
        const error = new Error('SerpApi did not return the quota fields needed to protect this account. No autocomplete search was sent.');
        error.status = 503; error.code = 'QUOTA_UNAVAILABLE'; throw error;
      }
      if (quota.plan_searches_left < 1 || quota.hourly_searches_left < 1) {
        const error = new Error('No SerpApi search is available for address suggestions right now. No autocomplete search was sent.');
        error.status = 429; error.code = quota.plan_searches_left < 1 ? 'PLAN_QUOTA_TOO_LOW' : 'HOURLY_LIMIT_TOO_LOW'; throw error;
      }
      return searchMapsAutocomplete(token, parsed.data.q, parsed.data.lat, parsed.data.lon);
    });
    return res.json({ results: suggestions });
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({ error: { code: error.code || 'UPSTREAM_UNAVAILABLE', message: error?.name === 'TimeoutError' ? 'Address search timed out. Retry the search.' : error.message || 'Address search is temporarily unavailable.' } });
  }
});

app.post('/api/v1/account', async (req, res) => {
  const token = tokenFrom(req);
  if (!token) return fail(res, 401, 'TOKEN_REQUIRED', 'Add a SerpApi token in Settings.');
  try {
    return res.json(await getAccount(token));
  } catch (error) {
    return fail(res, error.status || 502, error.code || 'UPSTREAM_UNAVAILABLE', error.message || 'Could not reach SerpApi. Try again.');
  }
});

app.post('/api/v1/summarize', async (req, res) => {
  const token = groqTokenFrom(req);
  if (!token) return fail(res, 401, 'GROQ_TOKEN_REQUIRED', 'Add a Groq API key in Settings to generate an explanation.');
  const context = parseSummaryContext(req.body);
  if (!context) return fail(res, 400, 'INVALID_SUMMARY_CONTEXT', 'The verdict summary context is invalid.');
  try {
    return res.json({ summary: await summarizeWithGroq(token, context) });
  } catch (error) {
    return fail(res, error.status || 502, error.code || 'GROQ_UNAVAILABLE', error?.name === 'TimeoutError' ? 'Groq timed out while writing the explanation.' : error.message || 'Groq is temporarily unavailable.');
  }
});

app.listen(port, () => { console.log(`SiteFit API listening on ${port}`); });
