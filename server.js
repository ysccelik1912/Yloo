const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Tüm CORS izinleri
app.use(cors());

// Render Health Check (Sunucunun ayakta kalması için gerekli)
app.get('/', (req, res) => {
    res.status(200).send('Yloo Proxy Server Aktif!');
});

// Proxy Middleware
app.use('/fetch', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL parametresi bulunamadı.');
    }

    try {
        const parsedUrl = new URL(targetUrl);

        const proxy = createProxyMiddleware({
            target: parsedUrl.origin,
            changeOrigin: true,
            followRedirects: true,
            pathRewrite: (path, req) => {
                return parsedUrl.pathname + parsedUrl.search;
            },
            onProxyRes: (proxyRes) => {
                // Iframe ve CSP engellerini kaldır
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['content-security-policy'];
                delete proxyRes.headers['frame-options'];
                proxyRes.headers['access-control-allow-origin'] = '*';
            },
            onError: (err, req, res) => {
                res.status(500).send('Proxy bağlantı hatası: ' + err.message);
            }
        });

        return proxy(req, res, next);
    } catch (err) {
        return res.status(400).send('Geçersiz URL formatı.');
    }
});

// Render dinamik PORT tanımlaması
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
