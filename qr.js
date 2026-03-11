const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const QRCode = require('qrcode');

const connectDB = require('./db');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const router = express.Router();

/* temp folder */

const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

/* delete folder */

function removeFile(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

router.get('/', async (req, res) => {

  const id = makeid();

  async function RAVEN() {

    const sessionPath = path.join(tempDir, id);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    try {

      const client = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: 'fatal' })
          )
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.windows('Edge')
      });

      client.ev.on('creds.update', saveCreds);

      client.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect, qr } = update;

        /* show QR */

        if (qr && !res.headersSent) {

          const qrImage = await QRCode.toDataURL(qr);

          res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Kish-MD | QR CODE</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>

body{
display:flex;
justify-content:center;
align-items:center;
min-height:100vh;
margin:0;
background:#000;
font-family:Arial,sans-serif;
color:#fff;
text-align:center;
padding:20px;
box-sizing:border-box;
}

.container{
max-width:600px;
width:100%;
}

.qr-box{
background:white;
padding:15px;
border-radius:20px;
width:300px;
height:300px;
margin:auto;
box-shadow:
0 0 0 10px rgba(255,255,255,0.1),
0 0 0 20px rgba(255,255,255,0.05),
0 0 30px rgba(255,255,255,0.2);
}

.qr-box img{
width:100%;
height:100%;
}

h1{
font-size:28px;
margin-bottom:15px;
font-weight:800;
}

p{
color:#ccc;
}

.back-btn{
display:inline-block;
margin-top:20px;
padding:12px 25px;
background:linear-gradient(135deg,#6e48aa,#9d50bb);
color:white;
text-decoration:none;
border-radius:30px;
font-weight:bold;
}

</style>
</head>

<body>

<div class="container">

<h1>Kish-MD QR CODE</h1>

<div class="qr-box">
<img src="${qrImage}">
</div>

<p>Scan this QR code with WhatsApp to connect</p>

<a href="./" class="back-btn">Back</a>

</div>

</body>
</html>
`);
        }

        /* connected */

        if (connection === "open") {

          console.log("✅ Connection Open");

          const db = await connectDB();

          await client.sendMessage(client.user.id, {
            text: "Generating your session, please wait..."
          });

          const credsPath = path.join(sessionPath, "creds.json");

          let sessionData = null;

          while (!sessionData) {

            if (fs.existsSync(credsPath)) {

              const raw = fs.readFileSync(credsPath);

              if (raw && raw.length > 100) {
                sessionData = JSON.parse(raw);
                break;
              }

            }

            await delay(1000);

          }

          /* create session id */

          const sessionId = crypto.randomBytes(16).toString("hex");

          /* store session in MongoDB */

          await db.collection("sessions").insertOne({
            id: sessionId,
            session: sessionData
          });

          const shortSession = "kish_" + sessionId;

          const session = await client.sendMessage(client.user.id, {
            text: shortSession
          });

          await client.sendMessage(client.user.id, {
            text:
              "`Kish-MD has been linked to your WhatsApp account!\n\n" +
              "Do NOT share this session ID with anyone.\n\n" +
              "Paste it in SESSION during deploy.\n\n" +
              "Example:\nSESSION=" + shortSession + "`"
          }, { quoted: session });

          await delay(2000);

          await client.ws.close();

          await delay(3000);

          removeFile(sessionPath);
        }

        if (connection === "close") {

          const code = lastDisconnect?.error?.output?.statusCode;

          console.log("Connection closed:", code);

          if (code !== 401) {

            console.log("🔁 Reconnecting...");

            await delay(5000);

            RAVEN();

          } else {

            await delay(3000);

            removeFile(sessionPath);

          }

        }

      });

    } catch (err) {

      console.log("service restarted", err);

      await delay(3000);

      removeFile(sessionPath);

      if (!res.headersSent) {
        res.send({
          error: "Service Currently Unavailable"
        });
      }

    }

  }

  await RAVEN();

});

module.exports = router;
