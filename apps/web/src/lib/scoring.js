export const distanceMetres = (a, b) => {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const normalize = response => (Array.isArray(response?.local_results) ? response.local_results : []).filter(p => p?.gps_coordinates && p.place_id).map(p => ({
  id: p.place_id,
  title: p.title || 'Unnamed place',
  lat: Number(p.gps_coordinates.latitude), lon: Number(p.gps_coordinates.longitude),
  rating: typeof p.rating === 'number' ? p.rating : null,
  reviews: typeof p.reviews === 'number' ? p.reviews : null,
  typeIds: p.type_ids || []
})).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

export function deriveMetrics(localResponse, baselineResponse, site) {
  if (!localResponse || !baselineResponse || !Number.isFinite(site?.lat) || !Number.isFinite(site?.lon)) {
    throw new TypeError('deriveMetrics requires separate local and baseline Maps responses plus a valid site coordinate.');
  }
  const local = normalize(localResponse), baseline = normalize(baselineResponse);
  const merged = new Map([...local, ...baseline].map(p => [p.id, p]));
  const places = [...merged.values()].map(p => ({ ...p, distance: distanceMetres(site, p) }));
  const inner = places.filter(p => p.distance <= 1000);
  const outer = places.filter(p => p.distance > 1000 && p.distance <= 5000);
  const localIds = new Set(local.map(p => p.id));
  const baselineIds = new Set(baseline.map(p => p.id));
  const localSample = places.filter(p => localIds.has(p.id) && p.distance <= 1000);
  const outerSample = places.filter(p => baselineIds.has(p.id) && p.distance > 1000 && p.distance <= 5000);
  const knownLocalReviews = localSample.filter(p => p.reviews !== null);
  const knownOuterReviews = outerSample.filter(p => p.reviews !== null);
  const average = xs => xs.length ? xs.reduce((n, x) => n + x.reviews, 0) / xs.length : null;
  const localVpo = average(knownLocalReviews), outerVpo = average(knownOuterReviews);
  const demandIndex = localVpo !== null && outerVpo > 0 ? localVpo / outerVpo : null;
  const rated = localSample.filter(p => p.rating !== null);
  const avgRating = rated.length ? rated.reduce((n, p) => n + p.rating, 0) / rated.length : null;
  const saturatedLocal = (localResponse?.local_results || []).length >= 20;
  const saturatedBaseline = (baselineResponse?.local_results || []).length >= 20;
  // The 5 km Maps response is relevance-ranked, not a complete spatial census.
  // Fewer outer-ring records than inner-ring records is a conservative signal
  // that the comparison sample may be under-represented.
  const comparisonUnderrepresented = outerSample.length < localSample.length;
  const sampleLimited = localSample.length < 3 || outerSample.length < 3 || saturatedLocal || saturatedBaseline;
  const reviewLimited = knownLocalReviews.length < 3 || knownOuterReviews.length < 3 || demandIndex === null;
  return {
    inner: inner.sort((a, b) => a.distance - b.distance), outer,
    localCount: localSample.length, outerCount: outerSample.length,
    localCompetitorIds: localSample.map(p => p.id), comparisonUnderrepresented,
    knownLocalReviews: knownLocalReviews.length, knownOuterReviews: knownOuterReviews.length,
    localReviewCoverage: localSample.length ? knownLocalReviews.length / localSample.length : 0,
    demandIndex, avgRating, saturatedLocal, saturatedBaseline,
    sampleLimited, reviewLimited, thin: sampleLimited || reviewLimited
  };
}

const limitedSampleReasons = metrics => {
  const reasons = [];
  if (metrics.localCount < 3) reasons.push(`Only ${metrics.localCount} usable business listings were returned within 1 km; at least 3 are needed for a directional comparison.`);
  if (metrics.outerCount < 3) reasons.push(`Only ${metrics.outerCount} usable comparison listings were returned from 1–5 km; the local baseline is too small.`);
  if (metrics.comparisonUnderrepresented) reasons.push('The 1–5 km comparison ring returned fewer listings than the 1 km local ring; Maps relevance ranking may have under-represented the wider area.');
  if (metrics.saturatedLocal || metrics.saturatedBaseline) reasons.push('At least one Maps sample reached the 20-result cap, so additional places may be missing.');
  return reasons;
};

export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export function axisScore(value, low, high) {
  if (![value, low, high].every(Number.isFinite) || high <= low) return null;
  return clamp(35 + ((value - low) / (high - low)) * 30, 0, 100);
}

export function labelForScore(score) {
  if (!Number.isFinite(score)) return null;
  return score >= 65 ? 'Untapped' : score >= 35 ? 'Competitive' : 'Oversupplied';
}

export function provisionalCompetitive(reason, evidence = {}) {
  return {
    status: 'scored',
    score: 50,
    label: 'Competitive',
    confidence: 'limited',
    axis: 'provisional',
    reasons: [reason, 'This is a provisional midpoint because required evidence is incomplete; missing listings are not treated as confirmed absence.'],
    evidence
  };
}

export function selectAnalysisPath({ localCount, outerCount }) {
  if (localCount <= 2) return 'sparse_multisignal';
  if (outerCount === 0) return 'provisional';
  return 'category_axis';
}

const scored = (score, axis, reasons, confidence = 'standard', evidence = {}) => ({
  status: 'scored', score, label: labelForScore(score), confidence, axis, reasons, evidence
});

const scoreConfidence = (metrics, contributingSamples = []) =>
  metrics.localCount < 3 || metrics.outerCount < 3 || metrics.saturatedLocal || metrics.saturatedBaseline ||
  contributingSamples.some(sample => sample?.capped)
    ? 'limited' : 'standard';

export function scoreReviewDriven(metrics) {
  const demand = metrics.demandIndex;
  if (metrics.outerCount === 0) return provisionalCompetitive('No usable 1–5 km comparison sample was returned, so review demand cannot be compared.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (metrics.localCount <= 2) return provisionalCompetitive('Sparse supply requires the retail-context check before the review result can be scored.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (demand === null || !Number.isFinite(demand)) return provisionalCompetitive('Review counts are missing or too sparse to compare local demand activity.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  let score = axisScore(demand, 0.85, 1.15);
  if (score >= 35 && score < 65 && metrics.avgRating !== null && metrics.avgRating < 4.0) score += 15;
  const reasons = [`Nearby competitors average ${demand.toFixed(2)}× the review count per listing of the 1–5 km comparison sample.`, `${metrics.localCount} usable competing listings were found within 1 km.`, 'Review counts are lifetime platform activity, not customer counts or visits.'];
  if (metrics.avgRating !== null && metrics.avgRating < 4 && score >= 50) reasons.push(`The local average rating is ${metrics.avgRating.toFixed(1)} stars; weaker incumbent ratings add a middle-band differentiation signal.`);
  return scored(clamp(score, 0, 100), 'demandIndex', reasons, scoreConfidence(metrics), { localCount: metrics.localCount, outerCount: metrics.outerCount });
}

export function buildRetailProbe(point) {
  return { q: 'retail', lat: point.lat, lon: point.lon, m: 1500, hl: 'en', gl: 'in', type: 'search' };
}

export function countNearbyPlaces(response, point, radius = 1000) {
  if (!response || !Array.isArray(response.local_results)) return null;
  const unique = new Map();
  for (const place of response.local_results) {
    const lat = Number(place?.gps_coordinates?.latitude), lon = Number(place?.gps_coordinates?.longitude);
    if (!place?.place_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (distanceMetres(point, { lat, lon }) <= radius) unique.set(place.place_id, place);
  }
  if (response.local_results.length > 0 && unique.size === 0) return null;
  return unique.size;
}

export function scoreAnchored(metrics, anchorsResponse, category, site, context = {}) {
  const anchors = category.anchors || [];
  if (metrics.localCount <= 2 && !Number.isFinite(context.retailCount)) return provisionalCompetitive('The sparse-site retail evidence is unavailable or unusable.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (metrics.outerCount === 0) return provisionalCompetitive('No usable 1–5 km comparison sample was returned.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (!anchors.length || anchors.some(anchor => !anchor.typeIds?.length || !Number.isFinite(anchor.sparseAt) || !Number.isFinite(anchor.richAt))) {
    return provisionalCompetitive('Demand-place types and category thresholds are not verified yet; residence counts are not inferred from names.', { anchorCount: null, localCount: metrics.localCount, outerCount: metrics.outerCount });
  }
  const responses = Array.isArray(anchorsResponse) ? anchorsResponse : [anchorsResponse];
  if (responses.length !== anchors.length || responses.some(response => !Array.isArray(response?.local_results))) {
    return provisionalCompetitive('One or more required demand-anchor searches are unavailable.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  }
  const competitorIds = new Set(metrics.localCompetitorIds || []);
  const ratios = anchors.map((anchor, index) => {
    const ids = new Map();
    for (const place of responses[index].local_results) {
      const lat = Number(place?.gps_coordinates?.latitude), lon = Number(place?.gps_coordinates?.longitude);
      if (!place?.place_id || competitorIds.has(place.place_id) || !(place.type_ids || []).some(id => anchor.typeIds.includes(id)) ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || distanceMetres(site, { lat, lon }) > anchor.radius) continue;
      ids.set(place.place_id, place);
    }
    return { anchor, count: ids.size, ratio: metrics.localCount ? ids.size / metrics.localCount : null, capped: responses[index].local_results.length >= 20 };
  });
  if (ratios.some(item => !Number.isFinite(item.ratio))) return provisionalCompetitive('The local competitor sample cannot support an anchor ratio.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (metrics.demandIndex === null || !Number.isFinite(metrics.demandIndex)) return provisionalCompetitive('Review-demand comparison is unavailable for the configured anchors.', { localCount: metrics.localCount, outerCount: metrics.outerCount, anchors: ratios });
  const scores = ratios.map(item => axisScore(item.ratio, item.anchor.sparseAt, item.anchor.richAt));
  if (scores.some(score => score === null)) return provisionalCompetitive('A category anchor threshold is invalid.', { localCount: metrics.localCount, outerCount: metrics.outerCount, anchors: ratios });
  const reviewScore = axisScore(metrics.demandIndex, 0.85, 1.15);
  const score = ratios.length > 1
    ? scores[0] * 0.5 + scores[1] * 0.25 + reviewScore * 0.25
    : scores[0] * 0.75 + reviewScore * 0.25;
  const reasons = ratios.map(item => `${item.count} verified ${item.anchor.label} within ${item.anchor.radius / 1000} km (anchor-to-competitor ratio ${item.ratio.toFixed(2)}).`);
  reasons.push(`Review-demand index: ${metrics.demandIndex.toFixed(2)}× the wider comparison sample.`);
  const retailCount = context.retailCount;
  const finalScore = retailCount === 0 ? Math.min(score, 64.99) : score;
  if (retailCount === 0) reasons.push('No nearby retail listings were found; this caps the result at Competitive even with stronger anchor evidence.');
  const capped = ratios.some(item => item.capped);
  return scored(finalScore, 'anchorComposite', reasons, scoreConfidence(metrics, [{ capped }]), { anchors: ratios, retailCount, localCount: metrics.localCount, outerCount: metrics.outerCount });
}

export function scoreSparseReviewDriven(metrics, retailResponse, point) {
  if (!retailResponse || !Array.isArray(retailResponse.local_results)) return provisionalCompetitive('The retail-context search failed; sparse-site demand cannot be assessed.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  const retailCount = countNearbyPlaces(retailResponse, point);
  if (retailCount === null) return provisionalCompetitive('The retail-context response had no usable coordinates in the catchment.', { localCount: metrics.localCount, outerCount: metrics.outerCount });
  if (metrics.demandIndex === null || !Number.isFinite(metrics.demandIndex)) return provisionalCompetitive('Retail context is available, but review demand cannot be compared reliably for this sparse sample.', { retailCount, localCount: metrics.localCount, outerCount: metrics.outerCount });
  const retailScore = axisScore(retailCount, 2, 5);
  const reviewScore = axisScore(metrics.demandIndex, 0.85, 1.15);
  let score = (retailScore + reviewScore) / 2;
  if (retailCount === 0) score = Math.min(score, 64.99);
  const reasons = [`${retailCount} nearby retail listings and a ${metrics.demandIndex.toFixed(2)}× competitor review-demand index were observed.`];
  if (retailCount === 0) reasons.push('Zero nearby retail is treated as one negative signal; it cannot alone produce an Untapped result.');
  return scored(score, 'sparseReviewComposite', reasons, 'limited', { retailCount, demandIndex: metrics.demandIndex, localCount: metrics.localCount, outerCount: metrics.outerCount });
}

// Anchor mappings are still being calibrated for some categories. Preserve a
// useful directional result from independent review and supply evidence rather
// than forcing every such site to the same midpoint. The result stays limited
// confidence until category-specific anchors are verified.
export function scoreUnverifiedAnchorFallback(metrics, retailResponse, point, category = null, anchorsResponse = null) {
  const result = metrics.localCount <= 2
    ? scoreSparseReviewDriven(metrics, retailResponse, point)
    : scoreReviewDriven(metrics);
  if (result.axis === 'provisional') return result;
  const anchors = category?.anchors || [];
  const responses = Array.isArray(anchorsResponse) ? anchorsResponse : [];
  const competitorIds = new Set(metrics.localCompetitorIds || []);
  const verifiedAnchors = anchors.map((anchor, index) => {
    const response = responses[index];
    const ids = new Set();
    for (const place of response?.local_results || []) {
      const lat = Number(place?.gps_coordinates?.latitude), lon = Number(place?.gps_coordinates?.longitude);
      if (!place?.place_id || competitorIds.has(place.place_id) || !(place.type_ids || []).some(id => anchor.typeIds.includes(id)) ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || distanceMetres(point, { lat, lon }) > anchor.radius) continue;
      ids.add(place.place_id);
    }
    return { anchor: { label: anchor.label, radius: anchor.radius }, count: ids.size, ratio: metrics.localCount ? ids.size / metrics.localCount : null };
  });
  return {
    ...result,
    confidence: 'limited',
    axis: 'reviewFallback',
    evidence: verifiedAnchors.length ? { ...result.evidence, anchors: verifiedAnchors } : result.evidence,
    reasons: [
      'Anchor type IDs are verified, but ratio thresholds are not calibrated yet; this directional result uses the anchor counts plus review-demand evidence.',
      ...result.reasons
    ]
  };
}
