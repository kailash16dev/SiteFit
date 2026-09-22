export default function LoadingPage({ category, placeLabel, phase = 'competitors' }) {
  const activeIndex = phase === 'final' ? 3 : phase === 'anchors' ? 2 : phase === 'demand' ? 1 : 0;
  const steps = [
    'Finding nearby businesses',
    'Comparing demand signals',
    'Analysing competition',
    'Checking local demand coverage'
  ];
  return <main className="content-page loading-page" aria-live="polite">
    <h1 className="page-title">Analysing this site</h1>
    <p className="page-intro">We're comparing local signals around <strong>{placeLabel || 'your selected pin'}</strong>.</p>
    <div className="loading-steps">
      {steps.map((label, index) => {
        const isCompleted = index < activeIndex;
        const isActive = index === activeIndex;
        const isPending = index > activeIndex;
        return <div className={`loading-step ${isCompleted ? 'complete' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`} key={label}>
          <span className="loading-step-status" aria-hidden="true">{isCompleted ? <span className="loading-check">✓</span> : isActive ? <span className="loading-spinner"/> : <span className="loading-pending"/>}</span>
          <span className="loading-step-label">{label}</span>
        </div>;
      })}
    </div>
    <div className="loading-skeleton">{[100, 75, 88, 60].map((width, index) => <i key={width} style={{ width: `${width}%`, animationDelay: `${index * 0.2}s` }}/>)}</div>
    <div className="loading-context"><span/>Analysing <strong>{category?.label || 'your business'}</strong> in {(placeLabel || 'your selected site').split(',')[0]}</div>
  </main>;
}
