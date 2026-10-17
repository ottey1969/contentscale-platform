'use strict';

// Single shared Chromium lifecycle for canonical ContentScale scanner routes.
function createBrowserManager({puppeteer, fs, env=process.env, logger=console, getCurrent, setCurrent}) {
  if (!puppeteer || !fs || !getCurrent || !setCurrent) throw new TypeError('Browser dependencies required');
  let launchPending = null;
  const paths = [
    env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean);
  async function getBrowser() {
    // Join any currently launching process. Never spawn one per concurrent request.
    if (launchPending) return launchPending;
    const current = getCurrent();
    if (current) {
      try {
        if (typeof current.isConnected === 'function' && !current.isConnected()) throw new Error('disconnected');
        await current.version();
        return current;
      } catch (_) {
        if (getCurrent() === current) setCurrent(null);
        try { await current.close(); } catch (_) {}
      }
    }
    launchPending = (async () => {
      const path = paths.find(p => fs.existsSync(p));
      try {
        logger.info('[browser] Launching shared Chromium at ' + (path || 'Puppeteer default'));
        // --single-process and --no-zygote crash some Linux/container Chromium
        // builds. Avoid both; preserve sandbox overrides needed by Railway.
        const browser = await puppeteer.launch({
          headless: true,
          ...(path ? {executablePath: path} : {}),
          timeout: 20000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-crash-reporter',
            '--no-first-run'
          ]
        });
        setCurrent(browser);
        if (typeof browser.on === 'function') browser.on('disconnected', () => {
          if (getCurrent() === browser) setCurrent(null);
          logger.warn('[browser] Chromium disconnected; next request can relaunch');
        });
        logger.info('[browser] Chromium ready');
        return browser;
      } catch (err) {
        setCurrent(null);
        // Log full failure; do not spam the host with immediately overlapping retries.
        logger.error('[browser] Chromium launch failed:', String(err && err.stack || err));
        return null;
      }
    })();
    try { return await launchPending; }
    finally { launchPending = null; }
  }
  return {getBrowser};
}
module.exports = {createBrowserManager};
