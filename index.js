
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

/* -------------------- IMPORT ROUTES -------------------- */

const qrRoutes = require('./qr');
const codeRoutes = require('./pair');


/* -------------------- FIX EVENT LIMIT -------------------- */

require('events').EventEmitter.defaultMaxListeners = 500;

/* -------------------- CREATE REQUIRED FOLDERS -------------------- */

const sessionsDir = path.join(__dirname, 'sessions');
const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

/* -------------------- MIDDLEWARE -------------------- */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------- API ROUTES -------------------- */

app.use('/qr', qrRoutes);
app.use('/code', codeRoutes);

/* -------------------- SESSION API -------------------- */
/* This lets your bot download the real session */

app.get('/session/:id', (req, res) => {

  const file = path.join(sessionsDir, req.params.id + '.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    const data = fs.readFileSync(file);
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("Session read error:", err);
    res.status(500).json({ error: "Failed to read session" });
  }

});

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

