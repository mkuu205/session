
const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const router = express.Router();

/* ensure main folders exist */

const sessionsDir = path.join(__dirname, "sessions");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

/* safe folder removal */

function removeFile(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

router.get('/', async (req, res) => {

  const id = makeid();
  let num = req.query.number;

  if (!num) {
    return res.send({
      error: "Missing number. Example: ?number=254712345678"
    });
  }

  num = num.replace(/[^0-9]/g, '');

  async function RAVEN() {

    const sessionPath = path.join(tempDir, id);

    /* IMPORTANT: ensure temp/<id> exists */

    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

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
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.windows('Edge')
      });

      client.ev.on('creds.update', saveCreds);

      client.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect } = update;

        if (connection === "connecting") {
          console.log("🔄 Connecting to WhatsApp...");
        }

        if (connection === "open") {

          console.log("✅ Connection Open");

          await client.sendMessage(client.user.id, {
            text: "Generating your session, please wait..."
          });

          const credsPath = path.join(sessionPath, "creds.json");

          let sessionData = null;

          /* wait until creds.json exists and is complete */

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

          /* generate short session ID */

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

          /* wait before deleting temp folder */

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

      if (!client.authState.creds.registered) {

        await delay(3000);

        const code = await client.requestPairingCode(num, "KISHTECH");

        if (!res.headersSent) {
          res.send({ code });
        }

      }

    } catch (err) {

      console.log("service restarted", err);

      await delay(3000);

      removeFile(sessionPath);

      if (!res.headersSent) {
        res.send({
          code: "Service Currently Unavailable"
        });
      }

    }

  }

  await RAVEN();

});

module.exports = router;
