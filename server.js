const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    credentials: true
}));

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
            autoRewrite: true,
            hostRewrite: true,
            protocolRewrite: 'https',
            pathRewrite: (path, req) => {
                return parsedUrl.pathname + parsedUrl.search;
            },
            on: {
                proxyReq: (proxyReq, req) => {
                    // Header bilgilerini koru
                    if (req.headers['content-type']) {
                        proxyReq.setHeader('Content-Type', req.headers['content-type']);
                    }
                    proxyReq.setHeader('User-Agent', req.headers['user-agent'] || 'Mozilla/5.0');
                },
                proxyRes: (proxyRes, req, res) => {
                    // Engelleri kaldır
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['frame-options'];

                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                    proxyRes.headers['Access-Control-Allow-Headers'] = '*';

                    // Otomatik yönlendirme (301, 302) durumlarında yeni adresi proxy adresiyle sarmala
                    if (proxyRes.headers['location']) {
                        let redirectUrl = proxyRes.headers['location'];
                        if (!redirectUrl.startsWith('http')) {
                            redirectUrl = new URL(redirectUrl, parsedUrl.origin).href;
                        }
                        const host = req.headers.host;
                        const protocol = req.protocol || 'https';
                        proxyRes.headers['location'] = `${protocol}://${host}/fetch?url=${encodeURIComponent(redirectUrl)}`;
                    }
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
