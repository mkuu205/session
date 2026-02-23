const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 8000;

// modules
const qrRoutes = require('./qr');
const codeRoutes = require('./pair');

require('events').EventEmitter.defaultMaxListeners = 500;

/* -------------------- MIDDLEWARE FIRST -------------------- */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* -------------------- ROUTES -------------------- */

// API routes
app.use('/qr', qrRoutes);
app.use('/code', codeRoutes);

// HTML pages
app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/fork-check', (req, res) => {
  res.sendFile(path.join(__dirname, 'fork-check.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

/* -------------------- ERROR HANDLER (IMPORTANT FOR RENDER) -------------------- */
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack);
  res.status(500).send("Internal Server Error");
});

/* -------------------- START SERVER -------------------- */
app.listen(port, () => {
  console.log(`📡 Connected on http://localhost:${port}`);
});

module.exports = app;
