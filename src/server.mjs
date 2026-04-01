import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join } from 'node:path';
import { URL } from 'node:url';
import { ROOT_DIR, runWatch } from './index.mjs';

const PORT = Number(process.env.PORT || 3000);
const REFRESH_MINUTES = Math.max(5, Number(process.env.REFRESH_MINUTES || 60));
const REFRESH_MS = REFRESH_MINUTES * 60 * 1000;
const PUBLIC_DIR = join(ROOT_DIR, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

let latest = {
  generatedAt: null,
  totalSources: 0,
  changedCount: 0,
  errorCount: 0,
  sources: [],
};
let isRunning = false;
let lastError = null;

async function refreshData() {
  if (isRunning) return latest;
  isRunning = true;

  try {
    latest = await runWatch();
    lastError = null;
    return latest;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'okänt fel';
    throw err;
  } finally {
    isRunning = false;
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function serveStatic(res, routePath) {
  const target = routePath === '/' ? '/index.html' : routePath;
  const filePath = join(PUBLIC_DIR, target);

  try {
    const content = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && requestUrl.pathname === '/api/status') {
    const payload = {
      ...latest,
      refreshMinutes: REFRESH_MINUTES,
      running: isRunning,
      lastError,
      nextRefreshAt: latest.generatedAt
        ? new Date(new Date(latest.generatedAt).getTime() + REFRESH_MS).toISOString()
        : null,
    };
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/run') {
    try {
      const updated = await refreshData();
      sendJson(res, 200, {
        ok: true,
        generatedAt: updated.generatedAt,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'okänt fel',
      });
    }
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(res, requestUrl.pathname);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, async () => {
  console.log(`EV Price Watcher Web kör på port ${PORT}`);
  console.log(`Auto-uppdatering: var ${REFRESH_MINUTES} min`);

  try {
    await refreshData();
    console.log('Första datainsamlingen klar.');
  } catch (err) {
    console.error('Första datainsamlingen misslyckades:', err);
  }

  const timer = setInterval(() => {
    refreshData().catch((err) => {
      console.error('Schemalagd uppdatering misslyckades:', err);
    });
  }, REFRESH_MS);

  // Allows process to exit cleanly in non-server contexts.
  timer.unref();
});
