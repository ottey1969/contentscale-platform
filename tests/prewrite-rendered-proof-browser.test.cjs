'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPublicGrowthPage } = require('../src/growth-safe-browser-renderer.cjs');
const { verifyApprovedContent } = require('../src/prewrite-implementation.cjs');

test('Chromium verifies JavaScript-rendered Pre-Write text only when it is rendered', { timeout: 30000 }, async () => {
  const puppeteer = require('puppeteer');
  const { chromium } = require('playwright');
  const url = 'https://proof.example/roof-repair/';
  const sentence = 'La reparación de la mañana requiere una revisión de la cubierta.';
  const text = Array(5).fill(sentence).join(' ');
  const markup = '<main>' + text + '</main>';
  const html = '<!doctype html><meta charset="utf-8"><title>Roof repair</title><main id="app"></main><script src="/app.js"></script>';
  let allowed = 0;
  const fetchHtml = async () => ({ html, final_url: url, status: 200, retrieved_at: new Date().toISOString() });

  async function verify(hidden) {
    const transport = {
      async launch(options) {
        const browser = await puppeteer.launch({ ...options, executablePath: chromium.executablePath() });
        return {
          close: () => browser.close(),
          async newPage() {
            const page = await browser.newPage();
            return {
              setRequestInterception: enabled => page.setRequestInterception(enabled),
              goto: (...args) => page.goto(...args),
              content: () => page.content(),
              url: () => page.url(),
              evaluate: (...args) => page.evaluate(...args),
              on: (event, handler) => page.on(event, request => handler({
                url: () => request.url(),
                method: () => request.method(),
                frame: () => request.frame(),
                isNavigationRequest: () => request.isNavigationRequest(),
                redirectChain: () => request.redirectChain(),
                abort: () => request.abort(),
                continue: () => {
                  allowed++;
                  if (request.url() === url) return request.respond({ status: 200, contentType: 'text/html', body: html });
                  if (request.url() === new URL('/app.js', url).href) {
                    const body = 'const root=document.getElementById("app");root.textContent=' + JSON.stringify(text) +
                      ';root.style.display=' + JSON.stringify(hidden ? 'none' : 'block');
                    return request.respond({ status: 200, contentType: 'application/javascript', body });
                  }
                  return request.respond({ status: 404, body: '' });
                }
              })),
              mainFrame: () => page.mainFrame()
            };
          }
        };
      }
    };
    return verifyApprovedContent(url, markup, fetchHtml, (target, options) =>
      renderPublicGrowthPage(target, { ...options, puppeteer: transport, lookup: async () => [{ address: '8.8.8.8' }] }));
  }

  assert.equal(await verify(true), null);
  const proof = await verify(false);
  assert.equal(proof?.status, 'approved_content_present');
  assert.equal(proof.source, 'LIVE_PUBLIC_BROWSER_RENDERED');
  assert.ok(allowed >= 4);
});
