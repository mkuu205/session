const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require("body-parser");
const port = process.env.PORT || 8000;

let server = require('./qr');
let code = require('./pair');

require('events').EventEmitter.defaultMaxListeners = 500;

/* ---------- middleware FIRST ---------- */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------- routes ---------- */
app.use('/qr', server);
app.use('/code', code);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/fork-check', (req, res) => {
  res.sendFile(path.join(__dirname, 'fork-check.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

/* ---------- start ---------- */
app.listen(port, () => {
  console.log(`📡 Connected on http://localhost:${port}`);
});

module.exports = app;
