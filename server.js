const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors());

app.get('/', (req, res) => {
    res.status(200).send('Yloo Proxy Server Aktif!');
});

// Tüm istekleri ve alt yolları (/search vb.) yakalayan proxy route
app.use('*', (req, res, next) => {
    let targetUrl = req.query.url;

    // Eğer parametre yoksa referer veya varsayılan yönlendirmeyi kontrol et
    if (!targetUrl) {
        if (req.originalUrl === '/' || req.originalUrl.startsWith('/?')) {
            return res.status(200).send('Proxy Aktif');
        }
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
