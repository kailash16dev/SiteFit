import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryPrompt, parseSummaryContext, validateSummaryText } from './summary.js';

const context = {
  label: 'Competitive',
  score: 50,
  confidence: 'limited',
  reasons: ['Two nearby competitors were found.', 'The review-demand index is 1.1.'],
  metrics: { nearbyCompetitors: 2, reviewDemandIndex: 1.1 }
};

test('summary context accepts only the supported deterministic contract', () => {
  assert.deepEqual(parseSummaryContext(context), context);
  assert.equal(parseSummaryContext({ ...context, rawResults: [] }), null);
  assert.equal(parseSummaryContext({ ...context, label: 'YES' }), null);
  assert.match(buildSummaryPrompt(context), /Verdict: Competitive \(score 50\/100, limited confidence\)/);
  assert.match(buildSummaryPrompt(context), /Key figures: \{"nearbyCompetitors":2,"reviewDemandIndex":1.1\}/);
});

test('summary validation permits grounded two-sentence plain text only', () => {
  assert.equal(validateSummaryText('Two nearby competitors make this market contested. The 1.1 review-demand index supports a careful approach.', context), 'Two nearby competitors make this market contested. The 1.1 review-demand index supports a careful approach.');
  assert.equal(validateSummaryText('There are 12 nearby competitors. The market is contested.', context), null);
  assert.equal(validateSummaryText('- Market contested. - Review evidence is mixed.', context), null);
  assert.equal(validateSummaryText('Market contested.', context), null);
  assert.equal(validateSummaryText('One sentence. Two sentences. Three sentences.', context), null);
});
