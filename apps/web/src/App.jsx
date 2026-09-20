import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, MapPin, MapPinCheckInside, Search, SlidersHorizontal, ShieldCheck, X, Store, Navigation, BadgeCheck, ChartNoAxesCombined, Landmark, Compass, Scale, Info, Eye, EyeOff } from 'lucide-react';
import MapPicker from './components/MapPicker.jsx';
import { CATEGORIES } from './lib/categories.js';
import { apiPost, getToken, TOKEN_KEY } from './lib/api.js';
import { deriveMetrics, scoreAnchored, scoreReviewDriven } from './lib/scoring.js';
import { cachedSearchCount, readCachedSearch, writeCachedSearch } from './lib/cache.js';

const samples = [
  { category: 'tuition', text: 'Tuition centre near Koramangala, Bengaluru', place: 'Koramangala, Bengaluru', point: { lat: 12.9352, lon: 77.6245 } },
  { category: 'gym', text: 'Gym near HSR Layout, Bengaluru', place: 'HSR Layout, Bengaluru', point: { lat: 12.9116, lon: 77.6389 } },
  { category: 'cafe', text: 'Café near Indiranagar, Bengaluru', place: 'Indiranagar, Bengaluru', point: { lat: 12.9784, lon: 77.6408 } },
  { category: 'pharmacy', text: 'Pharmacy near Whitefield, Bengaluru', place: 'Whitefield, Bengaluru', point: { lat: 12.9698, lon: 77.75 } }
];

export default function App() {
  const [page, setPage] = useState('home');
  const [categoryId, setCategoryId] = useState('');
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [token, setToken] = useState(getToken());
  const [serverTokenAvailable, setServerTokenAvailable] = useState(false);
  const [quotaSnapshot, setQuotaSnapshot] = useState(null);
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const category = useMemo(() => CATEGORIES.find(c => c.id === categoryId) || null, [categoryId]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE || ''}/api/v1/config`).then(response => response.ok ? response.json() : null).then(config => setServerTokenAvailable(Boolean(config?.localServerKeyConfigured))).catch(() => {});
  }, []);

  const lookupAddress = async () => {
    if (address.trim().length < 3) return;
    setGeoBusy(true); setGeoError('');
    const query = address.trim();
    const cacheKey = `sitefit:address:v1:${query.toLocaleLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.createdAt < 24 * 60 * 60 * 1000) { setResults(cached.results); setGeoBusy(false); return; }
      const response = await apiPost('/api/v1/maps/autocomplete', { q: query }, token);
      const suggestions = response.results || [];
      localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), results: suggestions }));
      setResults(suggestions);
      if (!suggestions.length) setGeoError('No Google Maps address suggestions found. You can choose a pin on the map.');
    }
    catch (e) { setGeoError(e.message); setResults([]); }
    finally { setGeoBusy(false); }
  };
  const chooseResult = item => { const p = { lat: item.lat, lon: item.lon }; setPoint(p); setPlaceLabel(item.label); setAddress(item.label.split(',').slice(0, 2).join(',')); setResults([]); };
  const useSample = item => { setCategoryId(item.category); setAddress(item.place); setPlaceLabel(item.place); setPoint(item.point); setNotice(''); };
  const runScan = async () => {
    if (!point || !category || (!token && !serverTokenAvailable)) return;
    setBusy(true); setNotice(''); setScan(null); setPage('loading');
    try {
      const q = { q: category.q, lat: point.lat, lon: point.lon, hl: 'en', gl: 'in' };
      const requests = [
        { ...q, m: 1500, type: 'search' },
        { ...q, m: 5000, type: 'search' },
        ...(category.driver === 'anchor' ? [{ q: category.anchorQuery, lat: point.lat, lon: point.lon, m: category.anchorRadius, hl: 'en', gl: 'in', type: 'search' }] : [])
      ];
      const responses = requests.map(readCachedSearch);
      const missing = requests.map((request, index) => ({ request, index })).filter(item => responses[item.index] === null);
      if (missing.length) {
        let batch;
        try { batch = await apiPost('/api/v1/maps/batch', { searches: missing.map(item => item.request) }, token); }
        catch (error) {
          error.partialResults.forEach((result, i) => writeCachedSearch(missing[i].request, result));
          throw error;
        }
        missing.forEach((item, i) => {
          responses[item.index] = batch.results[i];
          writeCachedSearch(item.request, batch.results[i]);
        });
        try { setQuotaSnapshot(await apiPost('/api/v1/account', {}, token)); } catch {}
      }
      const [local, baseline] = responses;
      const anchorResponse = category.driver === 'anchor' ? responses[2] : null;
      const metrics = deriveMetrics(local, baseline, point);
      const verdict = category.driver === 'anchor' ? scoreAnchored(metrics, anchorResponse, category, point) : scoreReviewDriven(metrics);
      const next = { category, placeLabel, point, metrics, verdict, rawCompetitors: local.local_results || [], capturedAt: Date.now() };
      setScan(next); setPage('verdict');
      try { localStorage.setItem(`sitefit:scan:${category.id}:${point.lat.toFixed(4)}:${point.lon.toFixed(4)}`, JSON.stringify({ capturedAt: next.capturedAt, verdict: verdict.verdict, demandIndex: metrics.demandIndex, anchorCount: verdict.anchorCount ?? null })); } catch {}
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
      <section className="hero"><div className="eyebrow"><span className="eyebrow-dot"/> PRE-LEASE FEASIBILITY</div><h1>Will this business work here?</h1><p className="hero-copy">Pick a business. Choose a site. Get an evidence-based answer about demand, competition and local activity.</p>
        <div className="search-card"><div className="field-head"><label className="field-label" htmlFor="business-type">Business type</label><span className="field-meta">Required</span></div><div className="select-wrap"><select id="business-type" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="" disabled>Select a business category…</option>{CATEGORIES.map(c => <option value={c.id} key={c.id}>{c.label}</option>)}</select><ChevronDown size={17}/></div>
          <div className="field-head location-label"><label className="field-label" htmlFor="address">Location</label><span className="field-meta">Street or locality</span></div><div className="address-input"><Search size={18}/><input id="address" value={address} onChange={e => { setAddress(e.target.value); setPoint(null); setPlaceLabel(''); }} onKeyDown={e => e.key === 'Enter' && lookupAddress()} placeholder="Search a locality or address"/><button className="search-icon" aria-label="Search address" onClick={lookupAddress} disabled={geoBusy}>{geoBusy ? <span className="mini-loader"/> : <ArrowRight size={17}/>}</button></div>
          {results.length > 0 && <div className="geocode-results">{results.map((r,i) => <button key={`${r.lat}-${i}`} onClick={() => chooseResult(r)}>{r.label}</button>)}</div>}
          {geoError && <p className="inline-error">{geoError} You can choose a pin on the map.</p>}
          {point && <div className="selected-place"><Check size={14}/><span>{placeLabel || `Pin ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`}</span><button onClick={() => setMapOpen(true)}>Change</button></div>}
          <div className="search-divider"/><div className="form-actions"><button className={`button pin-button ${point ? 'pin-set' : ''}`} onClick={() => setMapOpen(x=>!x)}><MapPin size={17}/>{point ? 'Change pin on map' : 'Choose pin on map'}</button><button className="button button-dark analyze-button" onClick={runScan} disabled={!category || !point || (!token && !serverTokenAvailable) || busy}>{busy ? <><span className="mini-loader light"/> Checking nearby places…</> : <>Analyse site <ArrowRight size={17}/></>}</button></div>
          <div className="token-hint"><span className="token-dot"/>{token ? 'SerpApi token active in this browser' : serverTokenAvailable ? 'Local development key configured' : 'SerpApi token required in Settings'}<span className="token-divider">·</span><button onClick={() => setPage('settings')}>Configure keys →</button></div>
          {notice && <div className="notice" role="alert">{notice} {notice.includes('Settings') && <button onClick={() => setPage('settings')}>Open Settings</button>}</div>}
        </div>
        <div className="sample-row"><span>Try:</span>{samples.map(s => <button key={s.category} onClick={() => useSample(s)}>{s.text.replace(' near ', ' near ')}</button>)}</div>
        {mapOpen && <MapPicker point={point} onChange={p => { setPoint(p); setPlaceLabel(p ? `Pinned site · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : ''); }} onClose={() => setMapOpen(false)} />}
        <a className="how-anchor" href="#how-preview" onClick={e => {e.preventDefault(); setPage('how');}}><span>↓</span> See how it works</a>
      </section>
      <section className="proof-section"><div className="section-kicker">EVALUATION ARCHITECTURE</div><h2>Precision feasibility criteria</h2><p className="proof-intro">Each recommendation uses public local signals and shows where the evidence is incomplete.</p><div className="proof-grid"><article><span className="proof-check"><MapPin size={16}/></span><div><b>Demand &amp; catchment</b><p>Relevant nearby schools, homes, clinics or offices based on the selected business.</p></div></article><article><span className="proof-check"><Search size={16}/></span><div><b>Direct saturation</b><p>Nearby competitors, their review volume and their distance from your pin.</p></div></article><article><span className="proof-check"><ShieldCheck size={16}/></span><div><b>Local activity</b><p>Public place signals for retail and access. Never a claim about people counts.</p></div></article></div></section>
      <HowPreview onOpen={() => setPage('how')}/>
    </main>}
    {page === 'how' && <HowPage onBack={() => setPage('home')} onStart={() => setPage('home')}/>}
    {page === 'settings' && <SettingsPage token={token} setToken={setToken} serverTokenAvailable={serverTokenAvailable} initialQuota={quotaSnapshot} onQuota={setQuotaSnapshot} onBack={() => setPage('home')}/>}
    {page === 'loading' && <LoadingPage category={category} placeLabel={placeLabel} />}
    {page === 'verdict' && scan && <VerdictPage scan={scan} onBack={() => setPage('home')} />}
    <footer className="site-footer"><span>SiteFit</span><span>Public place signals · no people counts</span><button onClick={() => setPage('settings')}>Settings</button></footer>
  </div>;
}

function LoadingPage({ category, placeLabel }) {
  return <main className="content-page loading-page" aria-live="polite"><div className="section-kicker">SITE ANALYSIS</div><h1 className="page-title">Checking this location</h1><p className="page-intro">Comparing nearby businesses and local demand signals for {category?.label || 'your business'} near {placeLabel || 'your selected pin'}.</p><div className="loading-progress"><span/><span/><span/></div><div className="loading-steps"><div className="loading-step active"><span className="loading-spinner"/><div><b>Finding nearby places</b><p>Collecting matching businesses around the selected pin.</p></div></div><div className="loading-step"><span className="step-number">2</span><div><b>Comparing local supply</b><p>Checking the wider area for a baseline.</p></div></div><div className="loading-step"><span className="step-number">3</span><div><b>Preparing the evidence</b><p>Building a directional result from returned public data.</p></div></div></div><div className="loading-skeleton"><i/><i/><i/></div></main>;
}

function HowPreview({ onOpen }) { return <section id="how-preview" className="how-preview"><div className="section-kicker">HOW IT WORKS</div><div className="steps-row">{[['01','Choose a business','Select a supported local business type.'],['02','Set your site','Search an address or place a pin.'],['03','Read the evidence','See a cautious verdict with its sources.']].map(([n,t,d])=><article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div><button className="text-arrow" onClick={onOpen}>Read how SiteFit works <ArrowRight size={16}/></button></section>; }
function HowPage({ onBack, onStart }) {
  const steps = [
    { n: '01', icon: <Store size={17}/>, title: 'Pick a business', copy: 'Choose a supported type such as tuition, gym, café, pharmacy or another local business.' },
    { n: '02', icon: <Navigation size={17}/>, title: 'Choose the site', copy: 'Search an address or drop a pin at the exact location you want to assess.' },
    { n: '03', icon: <BadgeCheck size={17}/>, title: 'See the evidence', copy: 'Get YES, MAYBE or NO with the returned signals and sample limitations.' }
  ];
  const checks = [
    { icon: <ChartNoAxesCombined size={17}/>, title: 'Competitor demand', copy: 'Compare competitor review counts per outlet with a wider local sample. Ratings add context; reviews are not customer counts.', example: 'Signal: reviews per outlet' },
    { icon: <Landmark size={17}/>, title: 'Demand anchors', copy: 'Search for nearby places associated with the business. Some place-type mappings still need verification before they can affect a verdict.', example: 'Example mapping: schools for tuition' },
    { icon: <Compass size={17}/>, title: 'Local activity', copy: 'Nearby retail, transit and destination places can provide context, but they do not reveal how many people walk along a street.', example: 'No pedestrian count available' },
    { icon: <Scale size={17}/>, title: 'Competition', copy: 'Measure nearby supply and distance around the pin. Sparse results can mean either an opportunity or an area with little activity.', example: 'Local sample: within 1 km' }
  ];
  return <main className="content-page how-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Back to analyse</button><header className="how-page-header"><div className="section-kicker">METHODOLOGY &amp; FRAMEWORK</div><h1 className="page-title">How it works</h1><p className="page-intro">SiteFit combines public location signals to help you assess whether a business may fit an area, with the evidence and limitations made clear.</p></header><section className="how-step-grid" aria-label="Analysis steps">{steps.map(step=><article className="how-step-card" key={step.n}><div className="how-step-top"><span>{step.n}</span><i>{step.icon}</i></div><div><h2>{step.title}</h2><p>{step.copy}</p></div></article>)}</section><section className="what-we-check"><header><h2>What we check</h2><p>Four dimensions that help put the available local evidence in context.</p></header><div className="method-grid">{checks.map(check=><article className="method-card" key={check.title}><div><div className="method-title">{check.icon}<h3>{check.title}</h3></div><p>{check.copy}</p></div><span className="method-example">{check.example}</span></article>)}</div></section><aside className="signal-note"><Info size={17}/><p><b>Public signals, not a people count.</b> Google Maps results may be incomplete. Review totals are lifetime platform activity, and a directional verdict is not a guarantee of business success.</p></aside><div className="how-cta"><button className="button button-dark" onClick={onStart}>Analyse a site <ArrowRight size={16}/></button><span>No account required. Add a SerpApi key in Settings.</span></div></main>;
}
function SettingsPage({ token, setToken, serverTokenAvailable, initialQuota, onQuota, onBack }) {
  const [draft, setDraft] = useState(token), [show, setShow] = useState(false), [status, setStatus] = useState(''), [checking, setChecking] = useState(false), [quota, setQuota] = useState(initialQuota);
  const save = () => { localStorage.setItem(TOKEN_KEY, draft.trim()); setToken(draft.trim()); setStatus('Token saved in this browser.'); };
  const test = async () => { setChecking(true); setStatus(''); try { const data = await apiPost('/api/v1/account', {}, draft.trim()); setQuota(data); onQuota(data); setStatus('Token is valid. Current limits are supplied by SerpApi.'); } catch (e) { setStatus(e.status === 401 ? 'Token rejected. Check the value and try again.' : e.message); } finally { setChecking(false); } };
  const clear = () => { localStorage.removeItem(TOKEN_KEY); setDraft(''); setToken(''); setQuota(null); onQuota(null); setStatus('Browser token removed.'); };
  const storageKeys = Object.keys(localStorage).filter(key => key.startsWith('sitefit:'));
  const searchKeys = storageKeys.filter(key => key.startsWith('sitefit:cache:') || key.startsWith('sitefit:address:'));
  const historyKeys = storageKeys.filter(key => key.startsWith('sitefit:scan:'));
  const storedBytes = storageKeys.reduce((total, key) => total + key.length + (localStorage.getItem(key)?.length || 0), 0);
  const localMode = !token && serverTokenAvailable;
  const connected = Boolean(token || serverTokenAvailable);
  const clearSearchCache = () => { searchKeys.forEach(key => localStorage.removeItem(key)); setStatus('Local search cache cleared.'); };
  const clearHistory = () => { historyKeys.forEach(key => localStorage.removeItem(key)); setStatus('Local scan summaries cleared.'); };
  return <main className="content-page settings-page"><div className="settings-content"><div className="settings-nav"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Back to analyse</button></div><header className="settings-heading"><h1 className="page-title">Settings</h1><p className="page-intro">Manage SiteFit configuration and local workspace storage.</p></header>
    <section className="settings-card api-settings-card"><header className="settings-card-heading"><div className="settings-card-overline"><span className="section-kicker">EXTERNAL API</span><span className="settings-badge">Required for scans</span></div><h2>Search data</h2><p>SiteFit uses SerpApi to find nearby businesses, competitor signals and Google Maps address suggestions. It does not provide street-level people counts.</p></header><div className="settings-key-field"><div className="settings-key-label"><label className="field-label" htmlFor="api-token">SerpApi token</label><a className="get-key-link" href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer">Get an API key <ArrowRight size={12}/></a></div><div className="token-input"><input id="api-token" type={show ? 'text' : 'password'} autoComplete="off" spellCheck="false" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Enter your SerpApi private key"/><button className="icon-button" onClick={()=>setShow(x=>!x)} aria-label={show ? 'Hide token' : 'Show token'}>{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div><div className="settings-actions"><button className="button button-dark" disabled={!draft.trim()} onClick={save}>Save</button><button className="button" disabled={(!draft.trim() && !serverTokenAvailable) || checking} onClick={test}>{checking ? 'Testing…' : 'Test token'}</button><button className="button button-quiet" disabled={!token} onClick={clear}>Clear</button></div></div><div className={`settings-key-status ${connected ? 'connected' : ''}`}><div className="settings-status-line"><div><i/><b>{token ? 'Browser token configured' : localMode ? 'Local API key configured' : 'No token configured'}</b></div><span>{connected ? (localMode ? 'Local development' : 'Ready for searches') : 'Offline mode'}</span></div><p>{token ? 'The key is stored in this browser and used by the local API relay for your requests.' : localMode ? 'A local-development key is available through the API relay. It stays on this machine and is never sent to the browser.' : 'Add a SerpApi key to enable address suggestions and live competitor searches. You can still explore the interface and choose a map pin.'}</p>{!connected && <a className="get-key-link status-link" href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer">Get a SerpApi key <ArrowRight size={13}/></a>}</div><div className="settings-privacy"><span><ShieldCheck size={17}/></span><p><b>Your key stays under your control.</b> A token entered here is kept in this browser’s localStorage and passed through the API relay per request. The relay does not save keys or searches. SiteFit has no user accounts. A `.env` key is supported only for local development.</p></div>{status && <p className={`settings-status ${status.includes('rejected') ? 'error' : ''}`} role="status">{status}</p>}{quota && <div className="quota-grid">{[['Plan', quota.plan_name],['Plan searches left', quota.plan_searches_left],['All credits left', quota.total_searches_left],['Hourly remaining', quota.hourly_searches_left],['Monthly plan limit', quota.monthly_search_limit],['Next renewal', quota.renewal_date]].map(([k,v])=><div key={k}><span>{k}</span><b>{v ?? 'Not provided'}</b></div>)}</div>}</section>
    <section className="settings-card cache-settings-card"><header className="settings-card-heading"><div className="settings-card-overline"><h2>Cached scans</h2><span className="settings-badge">{searchKeys.length} entries · {(storedBytes / 1024).toFixed(1)} KB</span></div><p>Search suggestions, nearby results and scan summaries stay in this browser to make repeat visits faster.</p></header><div className="settings-stats"><article><span>Saved scan summaries</span><b>{historyKeys.length}</b><small>Browser localStorage</small></article><article><span>Local data footprint</span><b>{(storedBytes / 1024).toFixed(1)} <small>KB</small></b><small>Stored on this device</small></article></div><div className="settings-storage-actions"><div><div><b>Search response cache</b><small>{searchKeys.length ? `${searchKeys.length} saved entries` : 'No cached address or Maps responses'}</small></div><button className="button" disabled={!searchKeys.length} onClick={clearSearchCache}>{searchKeys.length ? 'Clear cache' : 'Cache empty'}</button></div><div><div><b>Scan history</b><small>{historyKeys.length ? `${historyKeys.length} local summaries` : 'No recorded analysis runs'}</small></div><button className="button" disabled={!historyKeys.length} onClick={clearHistory}>{historyKeys.length ? 'Clear history' : 'No history'}</button></div></div></section><div className="settings-workspace"><span><CircleHelp size={14}/> Local browser workspace</span><span>Client storage v1</span></div></div></main>;
}
function VerdictPage({ scan, onBack, onActivity }) {
  const { category, placeLabel, metrics, verdict } = scan;
  const raw = scan.rawCompetitors.map(p => { const coords=p.gps_coordinates; if (!coords) return null; const { distanceMetres }=requireScoring; return { title:p.title, rating:p.rating, reviews:p.reviews, distance: distanceMetres(scan.point,{lat:Number(coords.latitude),lon:Number(coords.longitude)}) }; }).filter(Boolean).filter(p=>p.distance<=1000).sort((a,b)=>a.distance-b.distance);
  const shown=raw.slice(0,8), color=verdict.verdict.toLowerCase();
  return <main className="content-page verdict-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Scan another site</button><section className={`verdict-hero ${color}`} role="status" aria-live="polite"><div className="verdict-icon">{verdict.verdict==='YES'?'✓':verdict.verdict==='NO'?'×':'!'}</div><div><span className="section-kicker">SITE FEASIBILITY · {verdict.confidence==='limited'?'LIMITED SAMPLE':'DIRECTIONAL SIGNAL'}</span><h1>{verdict.verdict} <small>{verdict.verdict==='YES'?'Potential looks promising':verdict.verdict==='NO'?'Signals look unfavorable':'More validation needed'}</small></h1><p>{category.label} · {placeLabel || `${scan.point.lat.toFixed(4)}, ${scan.point.lon.toFixed(4)}`}</p></div></section><section className="evidence-section"><div className="section-kicker">WHY THIS RESULT</div><ul className="reasons">{verdict.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul></section><div className="metric-grid">{[[category.driver==='anchor'?'Demand anchors':'Review index',verdict.anchorCount ?? (metrics.demandIndex===null?'—':`${metrics.demandIndex.toFixed(2)}×`),category.driver==='anchor'?'verified nearby places':'local vs wider sample'],['Competitors nearby',metrics.localCount,'within 1 km'],['Sample coverage',metrics.thin?'Limited':'Directional',`${metrics.knownLocalReviews} local / ${metrics.knownOuterReviews} comparison review counts`]].map(([l,v,h])=><article className="metric-card" key={l}><span>{l}</span><b>{v}</b><small>{h}</small></article>)}</div><section className="activity-card"><div className="section-kicker">LOCAL ACTIVITY · DATA AVAILABILITY</div><div className="activity-row"><div><h2>Seven-day street activity unavailable</h2><p>This SerpApi Maps response does not include a seven-day pedestrian or busyness series. The verdict uses the competitor and demand-anchor evidence shown above.</p></div></div><p className="caveat">Review counts are lifetime platform activity, not daily visits or customer counts.</p></section><section className="competitor-section"><div className="section-kicker">MATCHING PLACES · WITHIN 1 KM</div><div className="table-wrap"><table><thead><tr><th>Business</th><th>Rating</th><th>Reviews</th><th>Distance</th></tr></thead><tbody>{(showAll?raw:shown).map((p,i)=><tr key={`${p.title}-${i}`}><td>{p.title}</td><td>{p.rating ?? '—'}</td><td>{p.reviews ?? '—'}</td><td>{p.distance < 1000?`${Math.round(p.distance)} m`:`${(p.distance/1000).toFixed(1)} km`}</td></tr>)}</tbody></table>{raw.length===0 && <p className="empty-row">No matching businesses with usable coordinates were returned.</p>}</div>{raw.length>8 && <button className="text-arrow" onClick={()=>setShowAll(x=>!x)}>{showAll?'Show fewer':`Show all (${raw.length})`}</button>}</section><p className="verdict-footnote">Google Maps results are ranked and may be incomplete. Review counts are not customer counts. Validate the location in person before making a financial decision.</p></main>;
}
const requireScoring = { distanceMetres: (a,b) => { const rad=d=>d*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),s=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 6371000*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)); } };
