import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, MapPin, MapPinCheckInside, Search, SlidersHorizontal, X, Store, Navigation, BadgeCheck, Landmark, Info, Eye, EyeOff, GraduationCap, Dumbbell, Coffee, Pill, Croissant, Laptop, BookOpen, Scissors, ShoppingBasket, Stethoscope, Utensils, Wrench, LockKeyhole } from 'lucide-react';
const MapPicker = lazy(() => import('./components/MapPicker.jsx'));
import LoadingScreen from './components/LoadingPage.jsx';
import VerdictPage from './components/VerdictPage.jsx';
import { CATEGORIES } from './lib/categories.js';
import { apiPost, getGroqToken, getToken, GROQ_TOKEN_KEY, TOKEN_KEY } from './lib/api.js';
import { buildRetailProbe, countNearbyPlaces, deriveMetrics, scoreAnchored, scoreReviewDriven, scoreSparseReviewDriven, scoreUnverifiedAnchorFallback } from './lib/scoring.js';
import { cachedSearchCount, readCachedSearch, writeCachedSearch } from './lib/cache.js';
import { buildSummaryContext, isGroundedSummary, readCachedSummary, writeCachedSummary } from './lib/summary.js';

const samples = [
  { category: 'tuition', text: 'Tuition centre near Koramangala, Bengaluru', place: 'Koramangala, Bengaluru', point: { lat: 12.9352, lon: 77.6245 } },
  { category: 'gym', text: 'Gym near HSR Layout, Bengaluru', place: 'HSR Layout, Bengaluru', point: { lat: 12.9116, lon: 77.6389 } },
  { category: 'cafe', text: 'Cafe near Indiranagar, Bengaluru', place: 'Indiranagar, Bengaluru', point: { lat: 12.9784, lon: 77.6408 } },
  { category: 'pharmacy', text: 'Pharmacy near Whitefield, Bengaluru', place: 'Whitefield, Bengaluru', point: { lat: 12.9698, lon: 77.75 } }
];

const categoryPresentation = {
  tuition: { icon: GraduationCap, description: 'K–12 coaching, STEM and test preparation' },
  preschool: { icon: BookOpen, description: 'Early learning, preschool and daycare' },
  stationery: { icon: BookOpen, description: 'School, office supplies and books' },
  gym: { icon: Dumbbell, description: 'Strength, fitness and group training' },
  salon: { icon: Scissors, description: 'Hair, beauty and personal care' },
  grocery: { icon: ShoppingBasket, description: 'Daily essentials and household goods' },
  pharmacy: { icon: Pill, description: 'Prescription, over-the-counter and wellness' },
  clinic: { icon: Stethoscope, description: 'Primary care and outpatient services' },
  cafe: { icon: Coffee, description: 'Coffee, light meals and quick visits' },
  restaurant: { icon: Utensils, description: 'Dine-in and takeaway food service' },
  bakery: { icon: Croissant, description: 'Fresh breads, pastries and desserts' },
  repair: { icon: Wrench, description: 'Mobile phone and electronics repair' },
  coworking: { icon: Laptop, description: 'Flexible desks and shared workspaces' }
};

export default function App() {
  const [page, setPage] = useState('home');
  const [categoryId, setCategoryId] = useState('');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const businessPickerRef = useRef(null);
  const addressRequestRef = useRef(0);
  const addressTimerRef = useRef(null);
  const summaryRequestRef = useRef(0);
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [token, setToken] = useState(getToken());
  const [groqToken, setGroqToken] = useState(getGroqToken());
  const [quotaSnapshot, setQuotaSnapshot] = useState(null);
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('competitors');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  const category = useMemo(() => CATEGORIES.find(c => c.id === categoryId) || null, [categoryId]);
  const plannedSearchCount = category ? 3 + (category.anchors || []).filter(anchor => anchor.typeIds?.length && Number.isFinite(anchor.sparseAt) && Number.isFinite(anchor.richAt)).length : 0;
  const quotaValues = quotaSnapshot ? [quotaSnapshot.plan_searches_left, quotaSnapshot.hourly_searches_left].filter(Number.isFinite) : [];
  const remainingSearches = quotaValues.length ? Math.min(...quotaValues) : null;

  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (!businessPickerRef.current?.contains(event.target)) setCategoryMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (page === 'verdict') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);

  useEffect(() => {
    if (page === 'how') {
      document.title = 'How it Works — SiteFit';
    } else if (page === 'settings') {
      document.title = 'Settings — SiteFit';
    } else if (page === 'loading') {
      document.title = category ? `Analyzing ${category.label}… — SiteFit` : 'Analyzing site… — SiteFit';
    } else if (page === 'verdict' && scan) {
      const verdictLabel = scan.verdict?.label || 'Verdict';
      const categoryLabel = scan.category?.label || 'Business';
      document.title = `${verdictLabel} · ${categoryLabel} — SiteFit`;
    } else {
      document.title = 'SiteFit — Know before you open';
    }
  }, [page, category, scan]);

  const lookupAddress = async () => {
    clearTimeout(addressTimerRef.current);
    if (address.trim().length < 3) return;
    if (!token) { setGeoError('Add your SerpApi token in Settings to search for an address.'); setResults([]); return; }
    const requestId = ++addressRequestRef.current;
    setGeoBusy(true); setGeoError('');
    const query = address.trim();
    const cacheKey = `sitefit:address:v1:${query.toLocaleLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.createdAt < 24 * 60 * 60 * 1000) {
        if (requestId === addressRequestRef.current) setResults(cached.results);
        return;
      }
      const response = await apiPost('/api/v1/maps/autocomplete', { q: query }, token);
      const suggestions = response.results || [];
      localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), results: suggestions }));
      if (requestId !== addressRequestRef.current) return;
      setResults(suggestions);
      if (!suggestions.length) setGeoError('No Google Maps address suggestions found. You can choose a pin on the map.');
    }
    catch (e) {
      if (requestId === addressRequestRef.current) { setGeoError(e.message); setResults([]); }
    }
    finally { if (requestId === addressRequestRef.current) setGeoBusy(false); }
  };

  useEffect(() => {
    clearTimeout(addressTimerRef.current);
    if (page !== 'home' || point || address.trim().length < 3 || !token) {
      addressRequestRef.current += 1;
      setResults([]);
      setGeoBusy(false);
      return;
    }
    addressTimerRef.current = setTimeout(() => {
      addressTimerRef.current = null;
      lookupAddress();
    }, 500);
    return () => {
      clearTimeout(addressTimerRef.current);
      addressRequestRef.current += 1;
    };
  }, [address, token, point, page]);
  const chooseResult = item => { const p = { lat: item.lat, lon: item.lon }; setPoint(p); setPlaceLabel(item.label); setAddress(item.label.split(',').slice(0, 2).join(',')); setResults([]); };
  const useSample = item => { setCategoryId(item.category); setAddress(item.place); setPlaceLabel(item.place); setPoint(item.point); setNotice(''); };
  const runScan = async () => {
    if (!point || !category || !token) return;
    setBusy(true); setNotice(''); setScan(null); setLoadingPhase('competitors'); setPage('loading');
    try {
      const base = { q: category.q, lat: point.lat, lon: point.lon, hl: 'en', gl: 'in' };
      const requests = [{ ...base, m: 1500, type: 'search' }, { ...base, m: 5000, type: 'search' }];
      const fetchMany = async queryList => {
        const values = queryList.map(readCachedSearch);
        const missing = queryList.map((request, index) => ({ request, index })).filter(item => values[item.index] === null);
        if (!missing.length) return values;
        const batch = await apiPost('/api/v1/maps/batch', { searches: missing.map(item => item.request) }, token);
        missing.forEach((item, index) => {
          values[item.index] = batch.results?.[index] ?? null;
          if (values[item.index]) writeCachedSearch(item.request, values[item.index]);
        });
        try { setQuotaSnapshot(await apiPost('/api/v1/account', {}, token)); } catch {}
        return values;
      };
      let localRaw, baselineRaw, coreError = null;
      try { [localRaw, baselineRaw] = await fetchMany(requests); } catch (error) { coreError = error; }
      const local = localRaw && Array.isArray(localRaw.local_results) ? localRaw : { local_results: [] };
      const baseline = baselineRaw && Array.isArray(baselineRaw.local_results) ? baselineRaw : { local_results: [] };
      const metrics = deriveMetrics(local, baseline, point);
      const sparse = metrics.localCount <= 2;
      let retailResponse = null;
      let anchorResponses = null;
      let verdict;

      if (!coreError && sparse) {
        setLoadingPhase('demand');
        const retailRequest = buildRetailProbe(point);
        try { [retailResponse] = await fetchMany([retailRequest]); } catch { retailResponse = null; }
      }

      const anchors = category.anchors || [];
      const anchorQueriesReady = category.driver === 'anchor' && anchors.length > 0 && anchors.every(anchor => anchor.typeIds?.length);
      const anchorsReady = anchorQueriesReady && anchors.every(anchor => Number.isFinite(anchor.sparseAt) && Number.isFinite(anchor.richAt));

      if (!coreError && anchorQueriesReady && (sparse || metrics.outerCount > 0)) {
        setLoadingPhase('anchors');
        const anchorRequests = anchors.map(anchor => ({
          q: anchor.query, lat: point.lat, lon: point.lon, m: anchor.radius, hl: 'en', gl: 'in', type: 'search'
        }));
        try { anchorResponses = await fetchMany(anchorRequests); } catch { anchorResponses = null; }
      }

      if (coreError) {
        verdict = { status: 'scored', score: 50, label: 'Competitive', confidence: 'limited', axis: 'provisional', reasons: ['Competitor searches could not be completed.', 'This provisional midpoint does not treat a failed search as evidence that no businesses exist.'], evidence: { localCount: 0, outerCount: 0 } };
      } else if (category.driver === 'reviews') {
        verdict = sparse
          ? scoreSparseReviewDriven(metrics, retailResponse, point)
          : scoreReviewDriven(metrics);
      } else if (anchorsReady) {
        const retailCount = sparse ? countNearbyPlaces(retailResponse, point) : undefined;
        verdict = scoreAnchored(metrics, anchorResponses, category, point, { retailCount });
      } else {
        verdict = scoreUnverifiedAnchorFallback(metrics, retailResponse, point, category, anchorResponses);
      }

      const combinedListings = [...baseline.local_results, ...local.local_results];
      const rawCompetitors = [...new Map(combinedListings.map(place => {
        const coordinates = place.gps_coordinates || {};
        const key = place.place_id || place.data_cid || `${place.title}:${coordinates.latitude}:${coordinates.longitude}`;
        return [key, place];
      })).values()];
      const next = { category, placeLabel, point, metrics, verdict, rawCompetitors, capturedAt: Date.now(), summary: null, summaryStatus: groqToken ? 'loading' : 'unavailable' };
      setScan(next); setPage('verdict');
      try { localStorage.setItem(`sitefit:scan:${category.id}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}`, JSON.stringify({ capturedAt: next.capturedAt, status: verdict.status, score: verdict.score ?? null, label: verdict.label ?? null })); } catch {}
      if (groqToken) {
        const requestId = ++summaryRequestRef.current;
        const context = buildSummaryContext(next);
        const cached = readCachedSummary(next, context);
        if (cached) {
          setScan(current => current?.capturedAt === next.capturedAt ? { ...current, summary: cached, summaryStatus: 'ready' } : current);
        } else {
          apiPost('/api/v1/summarize', context, '', groqToken)
            .then(result => {
              const summary = result?.summary;
              if (requestId !== summaryRequestRef.current || !isGroundedSummary(summary, context)) return;
              writeCachedSummary(next, context, summary);
              setScan(current => current?.capturedAt === next.capturedAt ? { ...current, summary, summaryStatus: 'ready' } : current);
            })
            .catch(() => {
              if (requestId === summaryRequestRef.current) setScan(current => current?.capturedAt === next.capturedAt ? { ...current, summaryStatus: 'unavailable' } : current);
            });
        }
      }
    } catch (e) {
      if (e.code === 'SERPAPI_QUOTA_OR_RATE_LIMIT') {
        try { setQuotaSnapshot(await apiPost('/api/v1/account', {}, token)); } catch {}
      }
      setNotice(e.status === 401 ? 'Token rejected. Check it in Settings.' : e.message);
      setPage('home');
    }
    finally { setBusy(false); }
  };

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><button className="brand" onClick={() => setPage('home')} aria-label="SiteFit home"><span className="brand-mark" aria-hidden="true"><MapPinCheckInside size={23} strokeWidth={1.8}/></span><span className="brand-name">SiteFit</span><span className="brand-tagline">Know before you open.</span></button><nav><button className={`nav-link ${page === 'how' ? 'active' : ''}`} onClick={() => setPage('how')}>How it works</button><button className="icon-button settings-nav" onClick={() => setPage('settings')} aria-label="Settings"><SlidersHorizontal size={19}/></button></nav></div></header>
    {page === 'home' && <main className="landing">
      <section className="hero"><h1>Find where your business fits.</h1><p className="hero-copy">Choose a business, select a location, and get an evidence-based view of demand, competition, and local activity.</p>
        <div className="search-card"><div className="field-head"><label className="field-label" id="business-type-label">Business type</label><span className="field-meta">Required</span></div><div className="business-picker" ref={businessPickerRef}><button id="business-type" type="button" className={`business-picker-trigger ${category ? 'has-value' : ''}`} onClick={() => setCategoryMenuOpen(open => !open)} onKeyDown={event => { if (event.key === 'Escape') setCategoryMenuOpen(false); if (event.key === 'ArrowDown') { event.preventDefault(); setCategoryMenuOpen(true); } }} aria-labelledby="business-type-label" aria-haspopup="listbox" aria-expanded={categoryMenuOpen}><span>{category?.label || 'Select a business category...'}</span><ChevronDown size={17} className={categoryMenuOpen ? 'is-open' : ''}/></button>{categoryMenuOpen && <div className="business-picker-menu" role="listbox" aria-labelledby="business-type-label"><div className="business-picker-menu-head"><span>Select feasibility model</span><span>{CATEGORIES.length} supported categories</span></div><div className="business-picker-options">{CATEGORIES.map(c => { const presentation = categoryPresentation[c.id] || { icon: Store, description: 'Local business and customer demand signals' }; const Icon = presentation.icon; const selected = categoryId === c.id; return <button key={c.id} type="button" role="option" aria-selected={selected} className={`business-picker-option ${selected ? 'selected' : ''}`} onClick={() => { setCategoryId(c.id); setCategoryMenuOpen(false); }}><span className="business-option-main"><span className="business-option-icon"><Icon size={17}/></span><span className="business-option-copy"><span>{c.label}</span><small>{presentation.description}</small></span></span>{selected && <Check size={17} className="business-option-check"/>}</button>; })}</div><div className="business-picker-menu-foot"><Landmark size={14}/><span>Benchmarked against local micro-catchments</span></div></div>}</div>
          <div className="search-divider form-section-divider"/><div className="field-head location-label"><label className="field-label" htmlFor="address">Location</label><span className="field-meta">Street or locality</span></div><div className="address-field-wrap"><div className="address-input"><button type="button" className="search-icon" aria-label="Search address" onClick={lookupAddress} disabled={!token || geoBusy}>{geoBusy ? <span className="mini-loader"/> : <Search size={18}/>}</button><input id="address" value={address} autoComplete="off" aria-controls="location-suggestions" aria-expanded={results.length > 0} onChange={e => { setAddress(e.target.value); setPoint(null); setPlaceLabel(''); setResults([]); setGeoError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupAddress(); } }} placeholder="Search a locality or address"/></div>
          {results.length > 0 && <div className="geocode-results" id="location-suggestions" role="listbox" aria-label="Location suggestions"><div className="geocode-results-heading">Suggested locations</div>{results.map((r,i) => <button type="button" role="option" aria-selected="false" key={`${r.lat}-${i}`} onClick={() => chooseResult(r)}><MapPin size={16}/><span>{r.label}</span></button>)}</div>}</div>
          {geoError && <p className="inline-error">{geoError} You can choose a pin on the map.</p>}
          {point && <div className="selected-place"><Check size={14}/><span>{placeLabel || `Pin ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`}</span><button onClick={() => setMapOpen(true)}>Change</button></div>}
          <div className="form-actions"><button className={`button pin-button ${point ? 'pin-set' : ''}`} onClick={() => setMapOpen(x=>!x)}><MapPin size={17}/>{point ? 'Change pin on map' : 'Choose pin on map'}</button><button className="button button-dark analyze-button" onClick={runScan} disabled={!category || !point || !token || busy}>{busy ? <><span className="mini-loader light"/> Checking nearby places…</> : <>Analyse site <ArrowRight size={17}/></>}</button></div>
          <div className="token-hint"><Info size={16}/>{token ? <>SerpApi token active in settings <span className="token-divider">·</span> <button onClick={() => setPage('settings')}>Configure keys <ArrowRight size={14}/></button></> : <>SerpApi token not configured <span className="token-divider">·</span> <button onClick={() => setPage('settings')}>Configure keys <ArrowRight size={14}/></button></>}</div>
          {category && <p className={remainingSearches !== null && remainingSearches < 20 ? 'scan-budget-note low' : 'scan-budget-note'}>This scan may use up to {plannedSearchCount} searches{remainingSearches !== null ? ` · ${remainingSearches} available under current limits` : ''}{remainingSearches !== null && remainingSearches < 20 ? ' · Low quota' : ''}</p>}
          {notice && <div className="notice" role="alert">{notice} {notice.includes('Settings') && <button onClick={() => setPage('settings')}>Open Settings</button>}</div>}
        </div>
        <div className="sample-row"><span>TRY AN EXAMPLE</span>{samples.map(s => <button key={s.category} onClick={() => useSample(s)}>{s.text.replace(' near ', ' near ').replace(', Bengaluru', '')}</button>)}</div>
        {mapOpen && <Suspense fallback={<div className="map-picker-loading">Loading map…</div>}><MapPicker point={point} placeLabel={placeLabel} onChange={p => { setPoint(p); if (p) { const pinLabel = `Pinned site · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`; setAddress(pinLabel); setPlaceLabel(pinLabel); } else { setAddress(''); setPlaceLabel(''); } }} onClose={() => setMapOpen(false)} /></Suspense>}
        <a className="how-anchor" href="#how-preview" onClick={e => {e.preventDefault(); setPage('how');}}><span>↓</span> See how it works</a>
      </section>
      <HowPreview onOpen={() => setPage('how')}/>
    </main>}
    {page === 'how' && <HowPage onBack={() => setPage('home')} onStart={() => setPage('home')}/>}
    {page === 'settings' && <SettingsPage token={token} setToken={setToken} groqToken={groqToken} setGroqToken={setGroqToken} initialQuota={quotaSnapshot} onQuota={setQuotaSnapshot} onBack={() => setPage('home')}/>}
    {page === 'loading' && <LoadingScreen category={category} placeLabel={placeLabel} phase={loadingPhase} />}
    {page === 'verdict' && scan && <VerdictPage scan={scan} onBack={() => setPage('home')} />}
    <footer className="site-footer"><span>SiteFit</span><span>Public place signals</span><button onClick={() => setPage('settings')}>Settings</button></footer>
  </div>;
}

function HowPreview({ onOpen }) { return <section id="how-preview" className="how-preview"><button className="text-arrow" onClick={onOpen}>How it works <ArrowRight size={15}/></button><p>We combine public business and place signals around your chosen site to help you understand demand, competition and local activity.</p></section>; }
function HowPage({ onBack, onStart }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);
  const steps = [
    { n: '01', icon: <Store size={17}/>, title: 'Pick a business', copy: 'Tell SiteFit what you want to open. Choose from a curated set of business categories we know how to evaluate.' },
    { n: '02', icon: <Navigation size={17}/>, title: 'Choose the site', copy: 'Search for an address, area, or select a precise point on the map. Drag the pin to your exact site.' },
    { n: '03', icon: <BadgeCheck size={17}/>, title: 'See the evidence', copy: 'Understand demand, competition and local supply around the site — in plain, actionable terms.' }
  ];
  const checks = [
    { title: 'Demand', copy: 'Signals that indicate whether there is a potential customer base nearby — schools, residential density, and relevant demand anchors.', example: 'Signal: local demand evidence' },
    { title: 'Demand anchors', copy: 'Schools, offices, residential areas, hospitals, transport and other destinations that attract your target customers.', example: 'Example: schools for tuition' },
    { title: 'Sparse-supply check', copy: 'When two or fewer competitors appear nearby, a broad retail search checks whether local commercial activity is present.', example: 'Fallback: general retail within 1 km' },
    { title: 'Competition', copy: 'Nearby businesses, their distance from your site, customer ratings and review volume.', example: 'Signal: local supply coverage' }
  ];
  return <main className="content-page how-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Back to analyse</button><header className="how-page-header"><h1 className="page-title">How it works</h1><p className="page-intro">SiteFit combines public location signals to help you understand whether a site makes sense for your business.</p></header><section className="how-step-list" aria-label="Analysis steps">{steps.map((step, index)=><article className="how-step" key={step.n}><div className="how-step-marker"><span>{step.n}</span>{index < steps.length - 1 && <i/>}</div><div className="how-step-content"><h2>{step.title}</h2><p>{step.copy}</p></div></article>)}</section><div className="how-divider"/><section className="what-we-check"><header><h2>What we check</h2></header><div className="method-grid">{checks.map(check=><article className="method-card" key={check.title}><div><div className="method-title"><h3>{check.title}</h3></div><p>{check.copy}</p></div><span className="method-example">{check.example}</span></article>)}</div></section><aside className="signal-note"><p className="signal-note-title">Public signals, not a people count.</p><p>SiteFit uses publicly available business and place signals. Results are estimates and should be considered alongside your own research.</p><p className="signal-note-foot">Every result shows its workings.</p></aside><div className="how-cta"><button className="button button-dark" onClick={onStart}>Analyse a site <ArrowRight size={16}/></button></div></main>;
}
function SettingsPage({ token, setToken, groqToken, setGroqToken, initialQuota, onQuota, onBack }) {
  const [draft, setDraft] = useState(token), [show, setShow] = useState(false), [groqDraft, setGroqDraft] = useState(groqToken), [showGroq, setShowGroq] = useState(false), [status, setStatus] = useState(''), [checking, setChecking] = useState(false), [quota, setQuota] = useState(initialQuota);
  const save = () => { localStorage.setItem(TOKEN_KEY, draft.trim()); setToken(draft.trim()); setStatus('Token saved in this browser.'); };
  const test = async () => { setChecking(true); setStatus(''); try { const data = await apiPost('/api/v1/account', {}, draft.trim()); setQuota(data); onQuota(data); setStatus('Token is valid. Current limits are supplied by SerpApi.'); } catch (e) { setStatus(e.status === 401 ? 'Token rejected. Check the value and try again.' : e.message); } finally { setChecking(false); } };
  const clear = () => { localStorage.removeItem(TOKEN_KEY); setDraft(''); setToken(''); setQuota(null); onQuota(null); setStatus('Browser token removed.'); };
  const saveGroq = () => { localStorage.setItem(GROQ_TOKEN_KEY, groqDraft.trim()); setGroqToken(groqDraft.trim()); setStatus('Optional Groq key saved in this browser.'); };
  const clearGroq = () => { localStorage.removeItem(GROQ_TOKEN_KEY); setGroqDraft(''); setGroqToken(''); setStatus('Optional Groq key removed from this browser.'); };
  const storageKeys = Object.keys(localStorage).filter(key => key.startsWith('sitefit:'));
  const searchKeys = storageKeys.filter(key => key.startsWith('sitefit:cache:') || key.startsWith('sitefit:address:'));
  const historyKeys = storageKeys.filter(key => key.startsWith('sitefit:scan:') || key.startsWith('sitefit:summary:'));
  const storedBytes = storageKeys.reduce((total, key) => total + key.length + (localStorage.getItem(key)?.length || 0), 0);
  const connected = Boolean(token);
  const clearSearchCache = () => { searchKeys.forEach(key => localStorage.removeItem(key)); setStatus('Local search cache cleared.'); };
  const clearHistory = () => { historyKeys.forEach(key => localStorage.removeItem(key)); setStatus('Local scan summaries cleared.'); };
  return <main className="content-page settings-page"><div className="settings-content"><div className="settings-nav"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Back to analyse</button></div><header className="settings-heading"><h1 className="page-title">Settings</h1><p className="page-intro">Manage SiteFit configuration and local workspace storage.</p></header>
    <section className="settings-card api-settings-card"><header className="settings-card-heading"><div className="settings-card-overline"><span className="section-kicker">EXTERNAL API</span><span className="settings-badge">Required for scans</span></div><h2>Search data</h2><p>SiteFit uses SerpApi for nearby businesses, related places, ratings, review counts and address suggestions. It does not provide reliable street-level people counts or footfall trends.</p></header><div className="settings-key-field"><div className="settings-key-label"><label className="field-label" htmlFor="api-token">SerpApi token</label><a className="get-key-link" href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer">Get an API key <ArrowRight size={12}/></a></div><div className="token-input"><input id="api-token" type={show ? 'text' : 'password'} autoComplete="off" spellCheck="false" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Enter your SerpApi private key (e.g. secret...)"/><button className="icon-button" onClick={()=>setShow(x=>!x)} aria-label={show ? 'Hide token' : 'Show token'}>{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><div className="settings-actions"><button className="button button-dark" disabled={!draft.trim()} onClick={save}>Save</button><button className="button" disabled={(!draft.trim() && !token) || checking} onClick={test}>{checking ? 'Testing…' : 'Test token'}</button><button className="button button-quiet" disabled={!token} onClick={clear}>Clear</button></div></div><div className={`settings-key-status ${connected ? 'connected' : ''}`}><div className="settings-status-line"><div><i/><b>{token ? 'Browser token configured' : 'No token configured'}</b></div><span>{connected ? 'Ready for searches' : 'Offline mode'}</span></div><p>{token ? 'Your saved browser token is used by the API relay for your searches.' : 'Add a SerpApi key to enable address suggestions and live competitor searches. SiteFit does not provide reliable footfall or people-count data.'}</p>{!connected && <a className="get-key-link status-link" href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer">Create free account on serpapi.com ↗</a>}</div><div className="settings-privacy"><span aria-hidden="true"><LockKeyhole size={20}/></span><p>Your token is stored only in this browser. It is sent directly over HTTPS when SiteFit performs a search and is never saved on our server. SiteFit does not require an account.</p></div>{status && <p className={`settings-status ${status.includes('rejected') ? 'error' : ''}`} role="status">{status}</p>}{quota && <div className="quota-grid">{[['Plan', quota.plan_name],['Plan searches left', quota.plan_searches_left],['All credits left', quota.total_searches_left],['Hourly remaining', quota.hourly_searches_left],['Monthly plan limit', quota.monthly_search_limit],['Next renewal', quota.renewal_date]].map(([k,v])=><div key={k}><span>{k}</span><b>{v ?? 'Not provided'}</b></div>)}</div>}</section>
    <section className="settings-card groq-settings-card"><header className="settings-card-heading"><div className="settings-card-overline"><span className="section-kicker">OPTIONAL AI</span><span className="settings-badge">Optional</span></div><h2>Verdict explanation</h2><p>Use Groq to write a short explanation from SiteFit’s completed score and evidence. It never changes the score or label.</p></header><div className="settings-key-field"><div className="settings-key-label"><label className="field-label" htmlFor="groq-token">Groq API key</label><a className="get-key-link" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Get an API key <ArrowRight size={12}/></a></div><div className="token-input"><input id="groq-token" type={showGroq ? 'text' : 'password'} autoComplete="off" spellCheck="false" value={groqDraft} onChange={e=>setGroqDraft(e.target.value)} placeholder="Enter an optional Groq API key"/><button className="icon-button" onClick={()=>setShowGroq(x=>!x)} aria-label={showGroq ? 'Hide Groq key' : 'Show Groq key'}>{showGroq ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><div className="settings-actions"><button className="button button-dark" disabled={!groqDraft.trim()} onClick={saveGroq}>Save</button><button className="button button-quiet" disabled={!groqToken} onClick={clearGroq}>Clear</button></div></div><div className={`settings-key-status ${groqToken ? 'connected' : ''}`}><div className="settings-status-line"><div><i/><b>{groqToken ? 'Optional AI summary configured' : 'No AI summary configured'}</b></div><span>{groqToken ? 'Ready after scans' : 'Verdicts remain complete'}</span></div><p>{groqToken ? 'The relay receives the key only while requesting a two-sentence explanation. The explanation is hidden if Groq is unavailable or cannot be verified.' : 'SerpApi alone produces every verdict. Add a Groq key only if you want a generated explanation beneath the result.'}</p></div></section>
    <section className="settings-card cache-settings-card"><header className="settings-card-heading"><div className="settings-card-overline"><h2>Cached scans</h2><span className="settings-badge">{searchKeys.length} entries · {(storedBytes / 1024).toFixed(1)} KB</span></div><p>Search suggestions, nearby results and optional AI summaries stay in this browser to make repeat visits faster.</p></header><div className="settings-stats"><article><span>Saved scan summaries</span><b>{historyKeys.length}</b><small>Browser localStorage</small></article><article><span>Local data footprint</span><b>{(storedBytes / 1024).toFixed(1)} <small>KB</small></b><small>Stored on this device</small></article></div><div className="settings-storage-actions"><div><div><b>Search response cache</b><small>{searchKeys.length ? `${searchKeys.length} saved entries` : 'No cached address or Maps responses'}</small></div><button className="button" disabled={!searchKeys.length} onClick={clearSearchCache}>{searchKeys.length ? 'Clear cache' : 'Cache empty'}</button></div><div><div><b>Scan history</b><small>{historyKeys.length ? `${historyKeys.length} local summaries` : 'No recorded analysis runs'}</small></div><button className="button" disabled={!historyKeys.length} onClick={clearHistory}>{historyKeys.length ? 'Clear history' : 'No history'}</button></div></div></section><div className="settings-workspace"><span><CircleHelp size={14}/> Local browser workspace</span><span>Client storage v1</span></div></div></main>;
}
