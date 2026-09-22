export function createOriginChecker(value = 'http://localhost:5173') {
  const configuredOrigins = value
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return function isAllowedOrigin(origin) {
    if (!origin || configuredOrigins.includes(origin)) return true;

    // Vercel preview deployments use a generated subdomain. Allow previews
    // for the configured project while keeping unrelated Vercel apps out.
    return configuredOrigins.some(configured => {
      try {
        const base = new URL(configured);
        const candidate = new URL(origin);
        if (base.protocol !== 'https:' || candidate.protocol !== 'https:' || !base.hostname.endsWith('.vercel.app')) return false;
        const projectName = base.hostname.slice(0, -'.vercel.app'.length);
        return candidate.hostname.startsWith(`${projectName}-`) && candidate.hostname.endsWith('.vercel.app');
      } catch {
        return false;
      }
    });
  };
}
