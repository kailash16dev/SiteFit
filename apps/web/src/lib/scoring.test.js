import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from './categories.js';
import { axisScore, buildRetailProbe, countNearbyPlaces, deriveMetrics, labelForScore, provisionalCompetitive, scoreAnchored, scoreReviewDriven, scoreSparseReviewDriven, selectAnalysisPath } from './scoring.js';

const site = { lat: 0, lon: 0 };
const place = (id, metres, reviews = 100, rating = 4.3, types = []) => ({
  place_id: id, title: id, gps_coordinates: { latitude: metres / 111195, longitude: 0 }, reviews, rating, type_ids: types
});
const samples = ({ localCount = 3, outerCount = 3, localReviews = 115, outerReviews = 100, rating = 4.3 } = {}) => ({
  local: { local_results: Array.from({ length: localCount }, (_, i) => place(`l${i}`, 100 + i * 100, localReviews, rating)) },
  baseline: { local_results: [
    ...Array.from({ length: localCount }, (_, i) => place(`l${i}`, 100 + i * 100, localReviews, rating)),
    ...Array.from({ length: outerCount }, (_, i) => place(`o${i}`, 2000 + i * 100, outerReviews, 4.2))
  ] }
});
const metricsFor = options => { const data = samples(options); return deriveMetrics(data.local, data.baseline, site); };

test('axis scoring and final labels use the agreed cutoffs', () => {
  assert.equal(axisScore(0.85, 0.85, 1.15), 35);
  assert.equal(axisScore(1.15, 0.85, 1.15), 65);
  assert.equal(axisScore(NaN, 0, 1), null);
  assert.equal(labelForScore(65), 'Untapped');
  assert.equal(labelForScore(64.99), 'Competitive');
  assert.equal(labelForScore(35), 'Competitive');
  assert.equal(labelForScore(34.99), 'Oversupplied');
});

test('review-driven categories score the review index and retain the rating tie-breaker', () => {
  assert.equal(scoreReviewDriven(metricsFor({ localReviews: 80, outerReviews: 100 })).label, 'Oversupplied');
  assert.equal(scoreReviewDriven(metricsFor({ localReviews: 120, outerReviews: 100 })).label, 'Untapped');
  assert.equal(scoreReviewDriven(metricsFor({ localReviews: 100, outerReviews: 100, rating: 3.9 })).score, 65);
});

test('every sparse count 0–2 selects retail plus category evidence path', () => {
  for (let localCount = 0; localCount <= 2; localCount++) {
    assert.equal(selectAnalysisPath({ localCount, outerCount: 3 }), 'sparse_multisignal');
  }
  assert.equal(selectAnalysisPath({ localCount: 3, outerCount: 3 }), 'category_axis');
  assert.deepEqual(buildRetailProbe(site), { q: 'retail', lat: 0, lon: 0, m: 1500, hl: 'en', gl: 'in', type: 'search' });
});

test('retail counts require a valid response and usable in-catchment place data', () => {
  assert.equal(countNearbyPlaces({ local_results: [] }, site), 0);
  assert.equal(countNearbyPlaces({ local_results: [place('r1', 100), place('r2', 200)] }, site), 2);
  assert.equal(countNearbyPlaces({ local_results: [{ place_id: 'bad' }] }, site), null);
  assert.equal(countNearbyPlaces(null, site), null);
});

test('sparse review result combines retail and review evidence; zero retail cannot yield Untapped', () => {
  const strong = scoreSparseReviewDriven(metricsFor({ localCount: 2, localReviews: 300, outerReviews: 100 }), { local_results: [] }, site);
  assert.equal(strong.label, 'Competitive');
  assert.ok(strong.score < 65);
  const weak = scoreSparseReviewDriven(metricsFor({ localCount: 2, localReviews: 0, outerReviews: 100 }), { local_results: [] }, site);
  assert.equal(weak.label, 'Oversupplied');
  const retailOnly = scoreSparseReviewDriven(metricsFor({ localCount: 0, outerCount: 3 }), { local_results: [] }, site);
  assert.equal(retailOnly.label, 'Competitive');
  assert.equal(retailOnly.confidence, 'limited');
});

test('failed or unusable required data returns a provisional Competitive midpoint', () => {
  const fallback = provisionalCompetitive('Anchor mapping unavailable.');
  assert.equal(fallback.label, 'Competitive');
  assert.equal(fallback.score, 50);
  assert.equal(fallback.confidence, 'limited');
  const failed = scoreSparseReviewDriven(metricsFor({ localCount: 1 }), null, site);
  assert.equal(failed.label, 'Competitive');
  assert.equal(failed.score, 50);
});

test('all twelve categories use the approved customer-anchor matrix', () => {
  assert.equal(CATEGORIES.length, 12);
  const expected = {
    tuition: ['school', 'apartment'], preschool: ['apartment', 'office'],
    stationery: ['school', 'coaching centre'], gym: ['apartment', 'office'],
    salon: ['apartment', 'office'], grocery: ['apartment'],
    pharmacy: ['clinic', 'apartment'], clinic: ['apartment'],
    cafe: ['office', 'college'], restaurant: [], bakery: [], repair: []
  };
  for (const category of CATEGORIES) {
    assert.deepEqual(category.anchors.map(anchor => anchor.query), expected[category.id]);
    assert.ok(category.anchors.every(anchor => anchor.typeIds.length === 0 && anchor.sparseAt === null && anchor.richAt === null));
  }
});

test('unverified residences and uncalibrated anchor ranges never become scores', () => {
  const category = CATEGORIES.find(item => item.id === 'gym');
  const result = scoreAnchored(metricsFor(), null, category, site);
  assert.equal(result.label, 'Competitive');
  assert.equal(result.score, 50);
  assert.equal(result.confidence, 'limited');
  assert.match(result.reasons.join(' '), /not verified/);
});

test('two verified anchor axes combine with review demand and zero retail caps at Competitive', () => {
  const metrics = metricsFor({ localCount: 3, outerCount: 3, localReviews: 200, outerReviews: 100 });
  const category = { anchors: [
    { label: 'schools', radius: 2000, typeIds: ['school'], sparseAt: 1, richAt: 3 },
    { label: 'residential places', radius: 2000, typeIds: ['residential'], sparseAt: 1, richAt: 3 }
  ] };
  const responses = [
    { local_results: Array.from({ length: 6 }, (_, i) => place(`s${i}`, 300 + i, 10, 4, ['school'])) },
    { local_results: Array.from({ length: 6 }, (_, i) => place(`r${i}`, 400 + i, 10, 4, ['residential'])) }
  ];
  const result = scoreAnchored(metrics, responses, category, site, { retailCount: 0 });
  assert.equal(result.label, 'Competitive');
  assert.equal(result.score, 62.5);
  assert.equal(result.evidence.anchors.length, 2);
});

test('single-anchor scoring uses configured evidence and missing secondary data stays provisional', () => {
  const category = { anchors: [{ label: 'schools', radius: 2000, typeIds: ['school'], sparseAt: 1, richAt: 3 }] };
  const metrics = metricsFor({ localCount: 3, outerCount: 3, localReviews: 115, outerReviews: 100 });
  const response = { local_results: Array.from({ length: 9 }, (_, i) => place('s' + i, 300 + i, 10, 4, ['school'])) };
  const result = scoreAnchored(metrics, [response], category, site);
  assert.equal(result.label, 'Untapped');
  assert.equal(result.axis, 'anchorComposite');
  assert.equal(scoreAnchored(metrics, null, { anchors: [category.anchors[0], category.anchors[0]] }, site).label, 'Competitive');
});

test('sparse and capped contributor samples carry limited confidence', () => {
  const data = samples({ localCount: 20, outerCount: 20 });
  const result = scoreReviewDriven(deriveMetrics(data.local, data.baseline, site));
  assert.equal(result.confidence, 'limited');
});
