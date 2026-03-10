const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

/* -------------------- IMPORT ROUTES -------------------- */

const qrRoutes = require('./qr');
const codeRoutes = require('./pair');

/* -------------------- FIX EVENT LIMIT -------------------- */

require('events').EventEmitter.defaultMaxListeners = 500;

/* -------------------- MIDDLEWARE -------------------- */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------- API ROUTES -------------------- */

app.use('/qr', qrRoutes);
app.use('/code', codeRoutes);

/* -------------------- HTML ROUTES -------------------- */

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/fork-check', (req, res) => {
  res.sendFile(path.join(__dirname, 'fork-check.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

/* -------------------- ERROR HANDLER -------------------- */

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack);
  res.status(500).send("Internal Server Error");
});

/* -------------------- START SERVER -------------------- */

app.listen(PORT, () => {
  console.log(`📡 Session Generator running on http://localhost:${PORT}`);
});

module.exports = app;
