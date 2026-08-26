const express = require('express');
const Unblocker = require('unblocker');
const cors = require('cors');

const app = express();

// CORS izinleri
app.use(cors());

// Unblocker motorunu başlatıyoruz
const unblocker = new Unblocker({
    prefix: '/proxy/'
});

app.use(unblocker);

app.get('/', (req, res) => {
    res.send('Proxy Backend Çalışıyor!');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktif.`);
});