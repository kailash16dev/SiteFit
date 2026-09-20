const CACHE_PREFIX = 'sitefit:cache:';
const SCHEMA_VERSION = 'v1';
const TTL = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 80;

function canonicalKey(query) {
  return `${CACHE_PREFIX}${SCHEMA_VERSION}:${JSON.stringify({
    q: query.q, lat: Number(query.lat).toString(), lon: Number(query.lon).toString(),
    m: query.m, type: query.type || 'search', hl: query.hl || 'en', gl: query.gl || 'in', start: query.start || 0
  })}`;
}

export function readCachedSearch(query) {
  const key = canonicalKey(query);
  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    if (!record || Date.now() - record.createdAt >= TTL) {
      localStorage.removeItem(key);
      return null;
    }
    record.lastAccessedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(record));
    return record.data;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function countUncachedSearches(queries) {
  return queries.filter(query => readCachedSearch(query) === null).length;
}

export function writeCachedSearch(query, data) {
  const key = canonicalKey(query), now = Date.now();
  try {
    localStorage.setItem(key, JSON.stringify({ createdAt: now, lastAccessedAt: now, data }));
    const records = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).map(k => {
      try { return [k, JSON.parse(localStorage.getItem(k) || 'null')]; } catch { return [k, null]; }
    });
    for (const [storedKey, record] of records) {
      if (!record || now - record.createdAt >= TTL) localStorage.removeItem(storedKey);
    }
    const live = records.filter(([, record]) => record && now - record.createdAt < TTL).sort((a,b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
    while (live.length > MAX_ITEMS) localStorage.removeItem(live.shift()[0]);
  } catch {
    // Search can proceed when browser storage is full; caching is only an optimization.
  }
}

export function cachedSearchCount() {
  return Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).length;
}
