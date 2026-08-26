const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors());

// Anasayfa kontrolü
app.get('/', (req, res) => {
    res.send('Yloo Proxy Backend Aktif!');
});

// Proxy route
app.use('/fetch', (req, res, next) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('URL parametresi eksik! Kullanım: /fetch?url=https://google.com');
    }

    try {
        const parsedUrl = new URL(targetUrl);
        
        const proxy = createProxyMiddleware({
            target: parsedUrl.origin,
            changeOrigin: true,
            followRedirects: true,
            pathRewrite: (path, req) => {
                // Sadece hedef URL'nin pathname + search kısmını gönderir
                return parsedUrl.pathname + parsedUrl.search;
            },
            on: {
                proxyRes: (proxyRes) => {
                    // X-Frame ve CSP engellerini silerek iframe içinde açılmasını sağla
                    delete proxyRes.headers['x-frame-options'];
                    delete proxyRes.headers['content-security-policy'];
                    delete proxyRes.headers['frame-options'];
                    proxyRes.headers['access-control-allow-origin'] = '*';
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
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
