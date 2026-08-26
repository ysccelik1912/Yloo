const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors());

// Dinamik proxy yönlendirmesi
app.use('/fetch', (req, res, next) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('URL parametresi eksik. Örn: /fetch?url=https://example.com');
    }

    const proxy = createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        followRedirects: true,
        on: {
            proxyRes: (proxyRes, req, res) => {
                // iframe engellerini (X-Frame-Options & CSP) kaldırıyoruz
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['content-security-policy'];
                proxyRes.headers['access-control-allow-origin'] = '*';
            }
        }
    });

    proxy(req, res, next);
});

app.get('/', (req, res) => {
    res.send('Yloo Proxy Backend Aktif!');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
