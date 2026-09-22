import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { deriveMetrics, provisionalCompetitive, scoreReviewDriven } from '../src/lib/scoring.js';

const vite = await createServer({
  configFile: false,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
try {
  const { default: VerdictPage } = await vite.ssrLoadModule('/src/components/VerdictPage.jsx');
  const { default: LoadingPage } = await vite.ssrLoadModule('/src/components/LoadingPage.jsx');
  const point = { lat: 12.9352, lon: 77.6245 };
  const place = (id, offset, reviews, rating) => ({
    place_id: id, title: `Mock business ${id}`, rating, reviews,
    gps_coordinates: { latitude: point.lat + offset / 111195, longitude: point.lon }
  });
  const makeScan = (localReviews, outerReviews) => {
    const local = { local_results: [place('a', 100, localReviews, 4.2), place('b', 200, localReviews, 4.2), place('c', 300, localReviews, 4.2)] };
    const baseline = { local_results: [...local.local_results, ...Array.from({ length: 5 }, (_, i) => place(`o${i}`, 1700 + i * 100, outerReviews, 4.2))] };
    const metrics = deriveMetrics(local, baseline, point);
    return {
      category: { id: 'restaurant', label: 'Restaurant', driver: 'reviews' },
      placeLabel: 'Koramangala, Bengaluru', point, metrics,
      verdict: scoreReviewDriven(metrics), rawCompetitors: baseline.local_results
    };
  };
  const loadingMarkup = renderToStaticMarkup(React.createElement(LoadingPage, {
    category: { label: 'Restaurant' }, placeLabel: 'Koramangala', phase: 'demand'
  }));
  assert.match(loadingMarkup, /Comparing demand signals/);
  assert.match(loadingMarkup, /Checking local demand coverage/);

  const labels = [
    [makeScan(115, 100), 'Untapped'],
    [makeScan(100, 100), 'Competitive'],
    [makeScan(80, 100), 'Oversupplied']
  ];
  for (const [scan, label] of labels) {
    const markup = renderToStaticMarkup(React.createElement(VerdictPage, { scan, onBack() {} }));
    assert.match(markup, new RegExp(label.toUpperCase()));
    assert.match(markup, /<span class="verdict-score"><b>\d+<\/b> \/ 100<\/span>/);
    assert.match(markup, /Competitors nearby/);
    assert.match(markup, /Mock business/);
    assert.doesNotMatch(markup, /MARKET READ/);
    assert.doesNotMatch(markup, /Confidence\s*\d+%/);
    assert.doesNotMatch(markup, /YES|MAYBE|\bNO\b/);
  }

  const provisionalScan = {
    ...makeScan(100, 100),
    verdict: provisionalCompetitive('The related-place mapping is being verified.')
  };
  const provisionalMarkup = renderToStaticMarkup(React.createElement(VerdictPage, { scan: provisionalScan, onBack() {} }));
  assert.match(provisionalMarkup, /COMPETITIVE/);
  assert.doesNotMatch(provisionalMarkup, /Limited confidence/);
  assert.doesNotMatch(provisionalMarkup, /Provisional\s*50\s*\/\s*100/);
  assert.doesNotMatch(provisionalMarkup, /NOT ENOUGH DATA/);
  const loadingSummaryMarkup = renderToStaticMarkup(React.createElement(VerdictPage, { scan: { ...makeScan(100, 100), summaryStatus: 'loading' }, onBack() {} }));
  assert.match(loadingSummaryMarkup, /MARKET READ/);
  assert.match(loadingSummaryMarkup, /Writing explanation…/);
  const readySummaryMarkup = renderToStaticMarkup(React.createElement(VerdictPage, { scan: { ...makeScan(100, 100), summaryStatus: 'ready', summary: 'Three nearby competitors make this market contested. The 1 review-demand index supports a careful approach.' }, onBack() {} }));
  assert.match(readySummaryMarkup, /MARKET READ/);
  assert.match(readySummaryMarkup, /Three nearby competitors make this market contested/);
  process.stdout.write('Mock SSR verified all three score labels, provisional Competitive evidence, the listing table, and demand loading step.\n');
} finally {
  await vite.close();
}
