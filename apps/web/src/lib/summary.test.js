import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryContext, isGroundedSummary } from './summary.js';

const scan = {
  metrics: { localCount: 2, outerCount: 5, demandIndex: 1.12, avgRating: 4.3 },
  verdict: {
    label: 'Competitive', score: 50, confidence: 'limited',
    reasons: ['2 nearby competitors were returned.', 'Review demand is 1.12 times the comparison sample.'],
    evidence: { retailCount: 3 }
  }
};

test('summary contexts contain deterministic score data, never raw listings', () => {
  const context = buildSummaryContext(scan);
  assert.deepEqual(context.metrics, { nearbyCompetitors: 2, comparisonCompetitors: 5, reviewDemandIndex: 1.12, localAverageRating: 4.3, nearbyRetailListings: 3 });
  assert.equal(context.score, 50);
  assert.equal('rawCompetitors' in context, false);
});

test('browser validation accepts grounded two sentences and rejects unsafe output', () => {
  const context = buildSummaryContext(scan);
  assert.equal(isGroundedSummary('Two nearby competitors make this market contested. The 1.12 review-demand index supports a careful approach.', context), true);
  assert.equal(isGroundedSummary('12 competitors make this market contested. The evidence is mixed.', context), false);
  assert.equal(isGroundedSummary('**Market contested.** The evidence is mixed.', context), false);
  assert.equal(isGroundedSummary('Market contested.', context), false);
});
