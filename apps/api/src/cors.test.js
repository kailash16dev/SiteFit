import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginChecker } from './cors.js';

test('allows the production origin and matching Vercel previews only', () => {
  const isAllowed = createOriginChecker('https://site-fit-web.vercel.app');
  assert.equal(isAllowed('https://site-fit-web.vercel.app'), true);
  assert.equal(isAllowed('https://site-fit-web-git-main-kailash16dev.vercel.app'), true);
  assert.equal(isAllowed('https://another-project.vercel.app'), false);
  assert.equal(isAllowed('http://site-fit-web.vercel.app'), false);
  assert.equal(isAllowed(undefined), true);
});

test('accepts comma-separated configured origins', () => {
  const isAllowed = createOriginChecker('http://localhost:5173, https://site-fit-web.vercel.app/');
  assert.equal(isAllowed('http://localhost:5173'), true);
  assert.equal(isAllowed('https://site-fit-web.vercel.app'), true);
});
