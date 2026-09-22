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
    env: { ...process.env, PORT: String(port), WEB_ORIGIN: 'http://localhost:5173' },
    stdio: 'ignore'
  });
  t.after(() => server.kill());
  await waitForServer();

  const missing = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, 'GROQ_TOKEN_REQUIRED');

  const malformed = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': 'test-key' }, body: '{"rawResults":[]}' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_SUMMARY_CONTEXT');

  const blank = await fetch(`${base}/api/v1/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': ' ' }, body: '{}' });
  assert.equal(blank.status, 401);
});
