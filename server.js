const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Tüm kaynaklara, metodlara ve header'lara tam izin ver
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    credentials: true
}));

// Preflight (OPTIONS) isteklerini anında onayla
app.options('*', cors());

app.get('/', (req, res) => {
    res.send('Yloo Proxy Backend Aktif!');
});

app.use('/fetch', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL parametresi eksik!');
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
            on: {
                proxyReq: (proxyReq, req) => {
                    // Login yaparken gönderilen Header ve Content-Type bilgilerini koru
                    if (req.headers['content-type']) {
                        proxyReq.setHeader('Content-Type', req.headers['content-type']);
                    }
                },
                proxyRes: (proxyRes) => {
                    // Iframe ve Güvenlik Engellerini Kaldır
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['frame-options'];
                    
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
                }
            }
        });

        return proxy(req, res, next);
    } catch (err) {
        return res.status(400).send('Geçersiz URL formatı!');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktif.`);
});
