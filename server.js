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
  // Strip any restricting meta referrer or CSP tags
  let processed = html
    .replace(/<meta[^>]*http-equiv=["']content-security-policy["'][^>]*>/gi, '')
    .replace(/<meta[^>]*name=["']referrer["'][^>]*>/gi, '')
    .replace(/<meta[^>]*content=["'][^"']*["'][^>]*name=["']referrer["'][^>]*>/gi, '');

  const injection = `
<meta name="referrer" content="no-referrer-when-downgrade">
<script>
  (function() {
    if (window.parent && window.parent !== window) {
      function notifyParent() {
        try {
          const currentUrl = new URL(window.location.href);
          let target = currentUrl.searchParams.get('url');
          if (target) {
            const targetUrl = new URL(target);
            currentUrl.searchParams.forEach((val, key) => {
              if (key !== 'url') {
                targetUrl.searchParams.set(key, val);
              }
            });
            target = targetUrl.href;
          } else {
            target = currentUrl.href;
          }
          window.parent.postMessage({
            type: 'yloo-navigation',
            url: target
          }, '*');
        } catch (e) {}
      }
      notifyParent();

      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(notifyParent, 100);
      };
      history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        setTimeout(notifyParent, 100);
      };
      window.addEventListener('popstate', () => setTimeout(notifyParent, 100));
    }
  })();
</script>
`;

  let headIndex = processed.search(/<head>/i);
  if (headIndex !== -1) {
    processed = processed.substring(0, headIndex + 6) + injection + processed.substring(headIndex + 6);
  } else {
    processed = injection + processed;
  }

  return processed
    .replace(/<base[^>]*>/gi, '')
    .replace(/\starget=(['"]?)([^'"\s>]+)\1/gi, ' target="_self"')
    // Rewrite form actions to submit via proxy fetch and append target URL as a hidden input
    .replace(/<form\s([^>]*)/gi, (match, attributes) => {
      let actionMatch = attributes.match(/action=(['"])([^'"]*)\1/i) || attributes.match(/action=([^s>]+)/i);
      let action = actionMatch ? actionMatch[2] : '';
      let resolvedAction = action ? new URL(action, baseUrl).href : baseUrl;
      let cleanAttributes = attributes.replace(/\saction=(['"]?)([^'"\s>]+)\1/i, '');
      return `<form action="/fetch" ${cleanAttributes}><input type="hidden" name="url" value="${resolvedAction}">`;
    })
    .replace(/\s(href|src|poster|formaction)=(['"])([^'"]*)\2/gi, (match, attr, quote, value) => {
      const rewritten = toProxyUrl(value, baseUrl);
      return rewritten ? ` ${attr}=${quote}${rewritten}${quote}` : match;
    })
    .replace(/\s(href|src|poster|formaction)=([^'"\s>][^\s>]*)/gi, (match, attr, value) => {
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

    // Store target origin in a cookie to resolve future relative requests from SPA routers
    try {
      const targetUrl = new URL(upstream.url || target);
      res.setHeader('Set-Cookie', `last_proxy_origin=${encodeURIComponent(targetUrl.origin)}; Path=/; HttpOnly; SameSite=Lax`);
    } catch (e) {}

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

app.all('*', (req, res, next) => {
  if (req.path === '/' || req.path === '/fetch') {
    return next();
  }

  let targetOrigin = null;

  // Try parsing the Referer header first
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const targetUrlParam = refererUrl.searchParams.get('url');
      if (targetUrlParam) {
        targetOrigin = new URL(targetUrlParam).origin;
      }
    } catch (e) {}
  }

  // Fallback to last_proxy_origin cookie if Referer is missing/stripped by browser
  if (!targetOrigin) {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/last_proxy_origin=([^;]+)/);
      if (match) {
        targetOrigin = decodeURIComponent(match[1]);
      }
    }
  }

  if (targetOrigin) {
    try {
      const targetUrl = new URL(req.originalUrl, targetOrigin).href;
      return res.redirect(`/fetch?url=${encodeURIComponent(targetUrl)}`);
    } catch (e) {
      console.error("Cookie/Referer redirection failed:", e);
    }
  }

  res.status(404).send(`Sayfa bulunamadı. Referer veya last_proxy_origin tanımlı olmadığı için proxy yönlendirmesi yapılamadı.`);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Yloo proxy ${PORT} portunda çalışıyor.`));

module.exports = app;

// Render start command: node server.js
// Browser URL format: /fetch?url=https%3A%2F%2Fexample.com
// All page links, assets and forms are rewritten back through this proxy.
