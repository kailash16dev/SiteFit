import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 18787;
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Summary relay did not start for the test.');
}

test('summary relay rejects missing credentials and malformed contexts before any Groq request', async t => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('.', import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), WEB_ORIGIN: 'https://site-fit-web.vercel.app' },
    stdio: 'ignore'
  });
  t.after(() => server.kill());
  await waitForServer();

  const productionCors = await fetch(`${base}/health`, { headers: { Origin: 'https://site-fit-web.vercel.app' } });
  assert.equal(productionCors.headers.get('access-control-allow-origin'), 'https://site-fit-web.vercel.app');

  const previewCors = await fetch(`${base}/health`, { headers: { Origin: 'https://site-fit-web-git-main-kailash16dev.vercel.app' } });
  assert.equal(previewCors.headers.get('access-control-allow-origin'), 'https://site-fit-web-git-main-kailash16dev.vercel.app');

  const unrelatedCors = await fetch(`${base}/health`, { headers: { Origin: 'https://another-project.vercel.app' } });
  assert.equal(unrelatedCors.headers.get('access-control-allow-origin'), null);

  const missing = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, 'GROQ_TOKEN_REQUIRED');

  const malformed = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': 'test-key' }, body: '{"rawResults":[]}' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_SUMMARY_CONTEXT');

  const blank = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': ' ' }, body: '{}' });
  assert.equal(blank.status, 401);
});
