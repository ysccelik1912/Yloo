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

function toProxyUrl(value, baseUrl) {
  const raw = value.trim();
  if (!raw || raw.startsWith('#') || /^(data|javascript|mailto|tel|blob):/i.test(raw)) return null;
  // Prevent double proxying if the URL is already rewritten
  if (raw.startsWith(PROXY_PREFIX) || raw.includes('/fetch?url=')) return raw;
  try {
    const absolute = new URL(raw, baseUrl).href;
    if (absolute.includes('/fetch?url=')) return absolute;
    return proxyUrl(absolute);
  } catch {
    return null;
  }
}

function rewriteHtml(html, baseUrl) {
  return html
    .replace(/<base[^>]*>/gi, '')
    .replace(/\starget=(['"]?)([^'"\s>]+)\1/gi, ' target="_self"')
    .replace(/\s(href|src|action|poster|formaction)=(['"])([^'"]*)\2/gi, (match, attr, quote, value) => {
      const rewritten = toProxyUrl(value, baseUrl);
      return rewritten ? ` ${attr}=${quote}${rewritten}${quote}` : match;
    })
    .replace(/\s(href|src|action|poster|formaction)=([^'"\s>][^\s>]*)/gi, (match, attr, value) => {
      const rewritten = toProxyUrl(value.replace(/[>\\/]$/, ''), baseUrl);
      return rewritten ? ` ${attr}="${rewritten}"` : match;
    })
    .replace(/url\((['"]?)([^)'"\s]+)\1\)/gi, (match, quote, value) => {
      const rewritten = toProxyUrl(value, baseUrl);
      return rewritten ? `url(${quote}${rewritten}${quote})` : match;
    })
    .replace(/(<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=)([^"']+)/gi, (match, prefix, value) => {
      const rewritten = toProxyUrl(value, baseUrl);
      return rewritten ? `${prefix}${rewritten}` : match;
    });
}

app.get('/', (_req, res) => res.status(200).send('Yloo Proxy Server Aktif'));

app.get('/fetch', async (req, res) => {
  const target = normalizeUrl(req.query.url);
  if (!target) return res.status(400).send('Geçersiz veya eksik URL.');

  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
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
