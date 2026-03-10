const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');

const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const zlib = require("zlib");

let router = express.Router();

const {
 default: RavenConnect,
 useMultiFileAuthState,
 Browsers,
 delay
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
 if (!fs.existsSync(FilePath)) return false;
 fs.rmSync(FilePath, {
  recursive: true,
  force: true
 });
}

router.get('/', async (req, res) => {

 const id = makeid();

 async function RAVEN() {

  const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

  try {

   let client = RavenConnect({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
   });

   client.ev.on('creds.update', saveCreds);

   client.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
     const qrImage = await QRCode.toBuffer(qr);
     return res.end(qrImage);
    }

    if (connection === "open") {

     await client.sendMessage(client.user.id, {
      text: "Generating your session_id... please wait"
     });

     await delay(50000);

     const credsPath = `./temp/${id}/creds.json`;

     if (!fs.existsSync(credsPath)) return;

     const data = fs.readFileSync(credsPath);

     /*
     COMPRESS SESSION
     */
     const compressed = zlib.gzipSync(data);

     /*
     CONVERT TO BASE64
     */
     const base64Session = compressed.toString("base64");

     /*
     FINAL SESSION
     */
     const sessionString = `Kish~${base64Session}`;

     const session = await client.sendMessage(client.user.id, {
      text: sessionString
     });

     const text =
`Kish-MD has been linked to your WhatsApp account!

Do NOT share this SESSION_ID with anyone.

Copy and paste it in the SESSION variable during deploy.

Good luck 🎉`;

     await client.sendMessage(
      client.user.id,
      { text },
      { quoted: session }
     );

     await delay(2000);

     await client.ws.close();

     removeFile(`./temp/${id}`);
    }

    else if (
     connection === "close" &&
     lastDisconnect &&
     lastDisconnect.error &&
     lastDisconnect.error.output.statusCode !== 401
    ) {
     await delay(10000);
     RAVEN();
    }

   });

  } catch (err) {

   console.log(err);

   if (!res.headersSent) {
    res.json({
     code: "Service is Currently Unavailable"
    });
   }

   removeFile(`./temp/${id}`);
  }

 }

 return RAVEN();

});

module.exports = router;
