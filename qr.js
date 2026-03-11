
const { makeid } = require('./id')
const QRCode = require('qrcode')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')
const connectDB = require('./mongo')

const {
 default: RavenConnect,
 useMultiFileAuthState,
 Browsers,
 delay,
 makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const router = express.Router()

const tempDir = path.join(__dirname, "temp")

if (!fs.existsSync(tempDir)) {
 fs.mkdirSync(tempDir, { recursive: true })
}

function removeFile(FilePath) {
 if (!fs.existsSync(FilePath)) return
 fs.rmSync(FilePath, { recursive: true, force: true })
}

router.get('/', async (req, res) => {

 const id = makeid()
 let responseSent = false

 async function RAVEN() {

  const sessionPath = path.join(tempDir, id)

  if (!fs.existsSync(sessionPath)) {
   fs.mkdirSync(sessionPath, { recursive: true })
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

  try {

   const client = RavenConnect({
    auth: {
     creds: state.creds,
     keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
    },
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop")
   })

   client.ev.on('creds.update', saveCreds)

   client.ev.on("connection.update", async (update) => {

    const { connection, qr } = update

    /* SHOW QR PAGE */

    if (qr && !responseSent) {

     const qrImage = await QRCode.toDataURL(qr)

     responseSent = true

     return res.send(`
<!DOCTYPE html>
<html>
<head>
<title>KISH-MD | QR CODE</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{
display:flex;
justify-content:center;
align-items:center;
min-height:100vh;
margin:0;
background:#000;
font-family:Arial;
color:#fff;
text-align:center
}
.container{max-width:600px;width:100%}
.qr-container{margin:20px auto;width:300px;height:300px}
.qr-code{
width:300px;height:300px;
padding:10px;
background:white;
border-radius:20px
}
.qr-code img{width:100%;height:100%}
</style>
</head>

<body>

<div class="container">

<h1>KISH QR CODE</h1>

<div class="qr-container">
<div class="qr-code">
<img src="${qrImage}">
</div>
</div>

<p>Scan this QR with WhatsApp</p>

</div>

</body>
</html>
`)
    }

    /* SESSION GENERATION */

    if (connection === "open") {

     console.log("✅ Connection Open")

     await client.sendMessage(client.user.id, {
      text: "Generating your session..."
     })

     const credsPath = path.join(sessionPath, "creds.json")

     let sessionData = null
     let attempts = 0

     while (!sessionData && attempts < 30) {

      if (fs.existsSync(credsPath)) {

       const raw = await fs.promises.readFile(credsPath).catch(() => null)

       if (raw && raw.length > 100) {
        try {
         sessionData = JSON.parse(raw)
        } catch {
         sessionData = null
        }
       }

      }

      attempts++
      await delay(1000)
     }

     if (!sessionData) {
      throw new Error("Failed to read session data")
     }

     const sessionId = crypto.randomBytes(16).toString("hex")

     const db = await connectDB()

     await db.collection("sessions").insertOne({
      sessionId: sessionId,
      creds: sessionData,
      createdAt: new Date()
     })

     const shortSession = "kish_" + sessionId

     const sessionMsg = await client.sendMessage(client.user.id, {
      text: shortSession
     })

     await client.sendMessage(client.user.id,{
      text:
       "Kish-MD linked successfully.\n\n" +
       "Do NOT share this session ID with anyone.\n\n" +
       "Example:\nSESSION=" + shortSession
     },{ quoted: sessionMsg })

     await delay(2000)

     await client.ws.close()

     await delay(3000)

     removeFile(sessionPath)
    }

   })

  } catch (err) {

   console.log(err)

   if (!responseSent && !res.headersSent) {
    responseSent = true
    res.json({ error: "Service unavailable" })
   }

   removeFile(sessionPath)

  }

 }

 await RAVEN()

})

module.exports = router
