const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const QRCode = require('qrcode');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const router = express.Router();

/* folders */

const sessionsDir = path.join(__dirname, "sessions");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

/* remove folder */

function removeFile(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

router.get('/', async (req, res) => {

  const id = makeid();

  /* loading screen */

  res.write(`
<!DOCTYPE html>
<html>
<head>
<title>Kish-MD | Preparing QR</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
body{
display:flex;
justify-content:center;
align-items:center;
height:100vh;
margin:0;
background:#000;
font-family:Arial;
color:white;
text-align:center;
}

.loader{
width:80px;
height:80px;
border-radius:50%;
border:6px solid rgba(255,255,255,0.1);
border-top:6px solid #9d50bb;
animation:spin 1s linear infinite;
margin:30px auto;
}

@keyframes spin{
0%{transform:rotate(0deg);}
100%{transform:rotate(360deg);}
}

.dots span{
animation:blink 1.4s infinite;
}

.dots span:nth-child(2){animation-delay:.2s}
.dots span:nth-child(3){animation-delay:.4s}

@keyframes blink{
0%,80%,100%{opacity:0}
40%{opacity:1}
}
</style>
</head>

<body>

<div>
<h1>Kish-MD</h1>
<div class="loader"></div>
<p>Preparing QR Code<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>
</div>
`);

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

        if (qr) {

          const qrImage = await QRCode.toDataURL(qr);

          res.write(`
<script>
document.body.innerHTML = \`
<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;font-family:Arial;color:white;text-align:center">

<div>

<h1>Kish-MD QR CODE</h1>

<div style="background:white;padding:10px;border-radius:20px;width:300px;height:300px;margin:auto">
<img src="${qrImage}" style="width:100%;height:100%">
</div>

<p style="color:#ccc">Scan with WhatsApp to connect</p>

<a href="./" style="display:inline-block;padding:10px 20px;background:#9d50bb;color:white;border-radius:30px;text-decoration:none">Back</a>

</div>
</div>
\`
</script>
`);
        }

        /* connected */

        if (connection === "open") {

          console.log("✅ Connection Open");

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

          /* create short session */

          const sessionId = crypto.randomBytes(16).toString("hex");

          fs.writeFileSync(
            path.join(sessionsDir, `${sessionId}.json`),
            JSON.stringify(sessionData)
          );

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

    }

  }

  await RAVEN();

});

module.exports = router;
