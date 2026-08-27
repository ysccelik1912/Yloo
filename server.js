const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const PROXY_PREFIX = '/fetch?url=';

app.use(cors({ origin: '*' }));
app.use(express.text({ type: ['text/html', 'application/xhtml+xml'] }));

function normalizeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  let target = value.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function proxyUrl(target) {
  return `${PROXY_PREFIX}${encodeURIComponent(target)}`;
}

function rewriteHtml(html, baseUrl) {
  return html
    .replace(/<base[^>]*>/gi, '')
    .replace(/(href|src|action)=(['"])(?!#|data:|javascript:|mailto:|tel:|https?:\/\/|\/\/)([^'"]+)\2/gi, (match, attr, quote, value) => {
      try { return `${attr}=${quote}${proxyUrl(new URL(value, baseUrl).href)}${quote}`; } catch { return match; }
    })
    .replace(/(href|src|action)=(['"])(https?:\/\/[^'"]+)\2/gi, (match, attr, quote, value) => `${attr}=${quote}${proxyUrl(value)}${quote}`)
    .replace(/url\((['"]?)(?!data:|https?:\/\/)([^)'"\s]+)\1\)/gi, (match, quote, value) => {
      try { return `url(${quote}${proxyUrl(new URL(value, baseUrl).href)}${quote})`; } catch { return match; }
    });
}

app.get('/', (_req, res) => res.status(200).send('Yloo Proxy Server Aktif'));

app.get('/fetch', async (req, res) => {
  const target = normalizeUrl(req.query.url);
  if (!target) return res.status(400).send('Geçersiz veya eksik URL.');

  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: { 'user-agent': 'YlooBrowser/1.0' },
    });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).set('content-type', contentType);
    res.set('cache-control', 'no-store');
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      return res.send(rewriteHtml(body.toString('utf8'), upstream.url || target));
    }
    return res.send(body);
  } catch (error) {
    return res.status(502).send(`Proxy hatası: ${error.message}`);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Yloo proxy ${PORT} portunda çalışıyor.`));

module.exports = app;

// Render start command: node server.js
// Browser URL format: /fetch?url=https%3A%2F%2Fexample.com
// All page links, assets and forms are rewritten back through this proxy.

