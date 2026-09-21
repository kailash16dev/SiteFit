export default function LoadingPage({ category, placeLabel, phase = 'competitors' }) {
  const activeIndex = phase === 'anchors' ? 2 : phase === 'demand' ? 1 : 0;
  return <main className="content-page loading-page" aria-live="polite">
    <div className="section-kicker">SITE ANALYSIS</div>
    <h1 className="page-title">Checking this location</h1>
    <p className="page-intro">Comparing nearby businesses and local demand signals for {category?.label || 'your business'} near {placeLabel || 'your selected pin'}.</p>
    <div className="loading-progress"><span/><span/><span/></div>
    <div className="loading-steps">
      {[
        ['Finding nearby businesses', 'Collecting local and comparison samples.'],
        ['Checking the demand base', 'Running the sparse-supply retail check when needed.'],
        ['Checking related places', 'Using only category mappings that have been verified.']
      ].map(([title, copy], index) => <div className={`loading-step ${index === activeIndex ? 'active' : index < activeIndex ? 'complete' : ''}`} key={title}>{index === activeIndex ? <span className="loading-spinner"/> : <span className="step-number">{index < activeIndex ? '✓' : index + 1}</span>}<div><b>{title}</b><p>{copy}</p></div></div>)}
    </div>
    <div className="loading-skeleton"><i/><i/><i/></div>
  </main>;
}
