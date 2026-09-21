import { useState } from 'react';
import { ArrowLeft, Star } from 'lucide-react';
import { distanceMetres } from '../lib/scoring.js';

export default function VerdictPage({ scan, onBack }) {
  const [showAll, setShowAll] = useState(false);
  const { category, placeLabel, metrics, verdict } = scan;
  const raw = scan.rawCompetitors
    .map(place => {
      const coordinates = place.gps_coordinates;
      if (!coordinates) return null;
      return {
        title: place.title,
        rating: place.rating,
        reviews: place.reviews,
        distance: distanceMetres(scan.point, {
          lat: Number(coordinates.latitude),
          lon: Number(coordinates.longitude)
        })
      };
    })
    .filter(Boolean)
    .filter(place => place.distance <= 2000)
    .sort((a, b) => a.distance - b.distance);
  const shown = raw.slice(0, 8);
  const color = verdict.label.toLowerCase().replace(/\s+/g, '-');
  const headline = verdict.label === 'Untapped' ? 'Demand outpaces supply' : verdict.label === 'Competitive' ? 'Market contested' : 'High saturation';

  return <main className="content-page verdict-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Scan another site</button>
    <section className={`verdict-hero ${color}`} role="status" aria-live="polite">
      <div className="verdict-icon">{verdict.label === 'Untapped' ? '✓' : verdict.label === 'Oversupplied' ? '×' : '!'}</div>
      <div className="verdict-main">
        <div className="verdict-meta"><span className="verdict-label">{verdict.label.toUpperCase()}</span><span className="verdict-score">{verdict.axis === 'provisional' && <b className="provisional-score">Provisional </b>}<b>{Math.round(verdict.score)}</b> / 100</span>{verdict.confidence === 'limited' && <span className="limited-badge">Limited confidence</span>}</div>
        <h1>{headline}</h1>
        <p>{category.label} · {placeLabel || `${scan.point.lat.toFixed(4)}, ${scan.point.lon.toFixed(4)}`}</p>
      </div>
    </section>
    <section className="evidence-section">
      <div className="section-kicker">WHY THIS RESULT</div>
      <ul className="reasons">{(verdict.reasons || []).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
    </section>
    <div className="metric-grid">{[
      ['Nearby competitors', metrics.localCount, 'usable business listings within 1 km'],
      ['Comparison sample', metrics.outerCount, 'usable business listings from 1–5 km'],
      ...(verdict.evidence?.retailCount !== undefined ? [['Nearby retail listings', verdict.evidence.retailCount, 'general retail listings within 1 km; one context signal']] : []),
      ...(verdict.evidence?.anchorCount !== undefined ? [['Demand anchors', verdict.evidence.anchorCount, 'verified related places in the selected catchment']] : []),
      ...(verdict.axis === 'demandIndex' && metrics.demandIndex !== null ? [['Review activity index', `${metrics.demandIndex.toFixed(2)}×`, 'average reviews per nearby competitor vs comparison sample']] : []),
      ...(verdict.evidence?.anchors ? verdict.evidence.anchors.map(item => [item.anchor.label, item.count, `verified places within ${item.anchor.radius / 1000} km; ratio ${item.ratio.toFixed(2)} per competitor`]) : [])
    ].map(([label, value, hint]) => <article className="metric-card" key={label}><span>{label}</span><b>{value}</b><small>{hint}</small></article>)}</div>
    <section className="competitor-section">
      <header className="competitor-heading"><div><h2>Competitors nearby</h2><p>Business listings within 2 km of your selected site</p></div><span>SORTED BY DISTANCE</span></header>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Rating</th><th>Reviews</th><th>Distance</th></tr></thead>
        <tbody>{(showAll ? raw : shown).map((place, index) => <tr key={`${place.title}-${index}`}><td>{place.title}</td><td><span className="competitor-rating">{place.rating ?? '—'}{place.rating !== null && place.rating !== undefined && <Star size={13} fill="currentColor" aria-hidden="true"/>}</span></td><td>{place.reviews ?? '—'}</td><td>{place.distance < 1000 ? `${Math.round(place.distance)} m` : `${(place.distance / 1000).toFixed(1)} km`}</td></tr>)}</tbody>
      </table>{raw.length === 0 && <p className="empty-row">No business listings with usable coordinates were returned.</p>}</div>
      {raw.length > 8 && <button className="text-arrow" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : `Show all (${raw.length})`}</button>}
    </section>
    <p className="verdict-footnote">Google Maps results are ranked and may be incomplete. Review counts are lifetime platform signals, not customer counts. Validate the location in person before making a financial decision.</p>
  </main>;
}
