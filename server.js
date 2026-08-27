const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors());

// Son ziyaret edilen ana adresi tutmak için değişken
let lastTargetDomain = 'https://www.google.com';

app.get('/', (req, res) => {
    res.status(200).send('Yloo Proxy Server Aktif!');
});

// Proxy route
app.use('/fetch', (req, res, next) => {
    let targetUrl = req.query.url;

    if (targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            lastTargetDomain = parsed.origin;
        } catch (e) {}
    } else {
        // Eğer url parametresi yoksa son bilinen domain üzerinden yolu tamamla
        targetUrl = lastTargetDomain + req.originalUrl.replace('/fetch', '');
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
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['content-security-policy'];
                delete proxyRes.headers['frame-options'];
                proxyRes.headers['access-control-allow-origin'] = '*';
            },
            onError: (err, req, res) => {
                res.status(500).send('Proxy hatası: ' + err.message);
            }
        });

        return proxy(req, res, next);
    } catch (err) {
        return res.status(400).send('Geçersiz URL formatı.');
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
