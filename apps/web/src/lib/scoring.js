export const distanceMetres = (a, b) => {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const normalize = response => (response?.local_results || []).filter(p => p?.gps_coordinates && p.place_id).map(p => ({
  id: p.place_id,
  title: p.title || 'Unnamed place',
  lat: Number(p.gps_coordinates.latitude), lon: Number(p.gps_coordinates.longitude),
  rating: typeof p.rating === 'number' ? p.rating : null,
  reviews: typeof p.reviews === 'number' ? p.reviews : null,
  typeIds: p.type_ids || []
})).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

export function deriveMetrics(localResponse, baselineResponse, site) {
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
  const innerArea = Math.PI, outerArea = Math.PI * 24;
  const densityIndex = outerSample.length ? (localSample.length / innerArea) / (outerSample.length / outerArea) : null;
  const rated = localSample.filter(p => p.rating !== null);
  const avgRating = rated.length ? rated.reduce((n, p) => n + p.rating, 0) / rated.length : null;
  const saturatedLocal = (localResponse?.local_results || []).length >= 20;
  const saturatedBaseline = (baselineResponse?.local_results || []).length >= 20;
  const thin = localSample.length < 3 || outerSample.length < 3 || saturatedLocal || saturatedBaseline || knownLocalReviews.length < 3 || knownOuterReviews.length < 3;
  return { inner: inner.sort((a,b) => a.distance-b.distance), outer, localCount: localSample.length, outerCount: outerSample.length, knownLocalReviews: knownLocalReviews.length, knownOuterReviews: knownOuterReviews.length, localReviewCoverage: localSample.length ? knownLocalReviews.length / localSample.length : 0, demandIndex, densityIndex, avgRating, saturatedLocal, saturatedBaseline, thin };
}

export function scoreReviewDriven(metrics) {
  const { demandIndex: demand, densityIndex: density, localCount, thin, avgRating } = metrics;
  if (thin || demand === null || density === null) return { verdict: 'MAYBE', confidence: 'limited', reasons: ['The Maps sample is too thin or capped to support a confident comparison.'] };
  const crowded = density > 1.5;
  if (demand >= 1.15 && !crowded) return { verdict: 'YES', confidence: 'directional', reasons: [`Nearby outlets average ${demand.toFixed(2)}× the reviews per outlet of the wider local sample.`, `The local sample includes ${localCount} matching outlets within 1 km.`] };
  if (demand >= 1.15 && crowded) return { verdict: 'MAYBE', confidence: 'directional', reasons: [`Review volume is ${demand.toFixed(2)}× the wider local sample, with elevated competitor concentration.`, avgRating !== null ? `Nearby businesses average ${avgRating.toFixed(1)} stars; reviews reflect lifetime visibility as well as demand.` : 'Competitor ratings are unavailable for this sample.'] };
  if (demand <= 0.85) return { verdict: 'NO', confidence: 'directional', reasons: [`Reviews per outlet are ${demand.toFixed(2)}× the wider local sample.`, `${localCount} matching businesses were observed within 1 km.`] };
  return { verdict: 'MAYBE', confidence: 'directional', reasons: [`Review volume is close to the wider local sample (${demand.toFixed(2)}×).`, 'Public reviews cannot establish customer counts or business profitability.'] };
}

export function scoreAnchored(metrics, anchors, category, site) {
  // Category type IDs are intentionally empty until verified; never claim anchors from an unfiltered query.
  if (!category.anchorTypeIds?.length) return { verdict: 'MAYBE', confidence: 'limited', reasons: [`The ${category.anchorLabel} type mapping has not yet been verified for this category.`], anchorCount: null };
  const qualified = (anchors?.local_results || []).filter(p => (p.type_ids || []).some(t => category.anchorTypeIds.includes(t)) && p.gps_coordinates).filter(p => distanceMetres({ lat: Number(p.gps_coordinates.latitude), lon: Number(p.gps_coordinates.longitude) }, site) <= category.anchorRadius);
  if (metrics.thin) return { verdict: 'MAYBE', confidence: 'limited', reasons: ['Competitor coverage is limited; validate the site locally.'], anchorCount: qualified.length };
  if (metrics.localCount === 0) return { verdict: qualified.length >= 3 ? 'MAYBE' : 'NO', confidence: 'limited', reasons: [qualified.length >= 3 ? `${qualified.length} demand anchors were found but no comparable competitor; check whether this is a genuine gap or a low-activity area.` : `Only ${qualified.length} qualifying demand anchors were found nearby.`], anchorCount: qualified.length };
  const ratio = qualified.length / metrics.localCount;
  if (ratio >= 3 && metrics.densityIndex <= 1.5) return { verdict: 'YES', confidence: 'directional', reasons: [`${qualified.length} qualifying ${category.anchorLabel} were found for ${metrics.localCount} nearby competitors.`], anchorCount: qualified.length };
  if (ratio <= 1) return { verdict: 'NO', confidence: 'directional', reasons: [`Only ${qualified.length} qualifying ${category.anchorLabel} were found for ${metrics.localCount} competitors.`], anchorCount: qualified.length };
  return { verdict: 'MAYBE', confidence: 'directional', reasons: [`${qualified.length} qualifying ${category.anchorLabel} and ${metrics.localCount} competitors were observed; the signal is mixed.`], anchorCount: qualified.length };
}
