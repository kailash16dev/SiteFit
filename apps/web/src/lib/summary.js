const CACHE_PREFIX = 'sitefit:summary:v1:';
const TTL = 24 * 60 * 60 * 1000;

const numberKey = value => String(Number(value));
const hash = value => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

export function buildSummaryContext(scan) {
  const { verdict, metrics } = scan;
  const supported = {
    nearbyCompetitors: metrics.localCount,
    comparisonCompetitors: metrics.outerCount
  };
  if (Number.isFinite(metrics.demandIndex)) supported.reviewDemandIndex = Number(metrics.demandIndex.toFixed(2));
  if (Number.isFinite(metrics.avgRating)) supported.localAverageRating = Number(metrics.avgRating.toFixed(1));
  if (Number.isFinite(verdict.evidence?.retailCount)) supported.nearbyRetailListings = verdict.evidence.retailCount;
  if (Number.isFinite(verdict.evidence?.anchorCount)) supported.verifiedDemandAnchors = verdict.evidence.anchorCount;
  if (Array.isArray(verdict.evidence?.anchors)) supported.verifiedDemandAnchors = verdict.evidence.anchors.reduce((total, item) => total + (Number.isFinite(item.count) ? item.count : 0), 0);
  return {
    label: verdict.label,
    score: Math.round(verdict.score),
    confidence: verdict.confidence === 'limited' ? 'limited' : 'standard',
    reasons: (verdict.reasons || []).filter(reason => typeof reason === 'string').slice(0, 6),
    metrics: Object.fromEntries(Object.entries(supported).filter(([, value]) => Number.isFinite(value)))
  };
}

export function summaryCacheKey(scan, context) {
  const { category, point } = scan;
  return `${CACHE_PREFIX}${category.id}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}:${hash(JSON.stringify(context))}`;
}

export function readCachedSummary(scan, context) {
  const key = summaryCacheKey(scan, context);
  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    if (!record || Date.now() - record.createdAt >= TTL || record.contextHash !== hash(JSON.stringify(context)) || typeof record.summary !== 'string') {
      localStorage.removeItem(key);
      return null;
    }
    return record.summary;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function writeCachedSummary(scan, context, summary) {
  try {
    localStorage.setItem(summaryCacheKey(scan, context), JSON.stringify({
      createdAt: Date.now(),
      contextHash: hash(JSON.stringify(context)),
      summary
    }));
  } catch {
    // Explanations remain optional when browser storage is unavailable.
  }
}

export function isGroundedSummary(value, context) {
  if (typeof value !== 'string') return false;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 500 || /[`*_#>[\]\r\n]|(^|\s)[•-]\s/.test(text)) return false;
  const endings = text.match(/[.!?](?=\s|$)/g) || [];
  if (endings.length !== 2 || !/[.!?]$/.test(text)) return false;
  const allowed = new Set((JSON.stringify(context).match(/\d+(?:\.\d+)?/g) || []).map(numberKey));
  return (text.match(/\d+(?:\.\d+)?/g) || []).every(number => allowed.has(numberKey(number)));
}
