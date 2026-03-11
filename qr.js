
const { makeid } = require('./id')
const QRCode = require('qrcode')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')

const {
 default: RavenConnect,
 useMultiFileAuthState,
 Browsers,
 delay,
 makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const router = express.Router()

function removeFile(FilePath) {
 if (!fs.existsSync(FilePath)) return
 fs.rmSync(FilePath, { recursive: true, force: true })
}

router.get('/', async (req, res) => {

 const id = makeid()

 async function RAVEN() {

  const sessionPath = `./temp/${id}`

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

    const { connection, lastDisconnect, qr } = update

    /* SHOW QR PAGE */

    if (qr) {

     const qrImage = await QRCode.toDataURL(qr)

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
.back-btn{
display:inline-block;
padding:12px 25px;
background:#9d50bb;
color:white;
text-decoration:none;
border-radius:30px;
margin-top:20px
}
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

    if (connection === "open") {

     await client.sendMessage(client.user.id, {
      text: "Generating your session..."
     })

     const credsPath = `${sessionPath}/creds.json`

     let sessionData = null

     while (!sessionData) {

      if (fs.existsSync(credsPath)) {

       const data = fs.readFileSync(credsPath)

       if (data && data.length > 100) {
        sessionData = data
        break
       }

      }

      await delay(1000)
     }

     /* generate short session id */

     const sessionId = crypto.randomBytes(16).toString("hex")

     const sessionJSON = JSON.parse(sessionData)

     /* save real session to server */

     fs.writeFileSync(
      path.join(__dirname, "sessions", `${sessionId}.json`),
      JSON.stringify(sessionJSON)
     )

     const shortSession = "kish_" + sessionId

     const session = await client.sendMessage(client.user.id, {
      text: shortSession
     })

     await client.sendMessage(client.user.id,{
      text: "Kish-MD linked successfully.\n\nDo NOT share this session ID with anyone."
     },{ quoted: session })

     await delay(2000)

     await client.ws.close()

     removeFile(sessionPath)

    }

    if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {

     await delay(5000)

     RAVEN()

    }

   })

  } catch (err) {

   console.log(err)

   if (!res.headersSent) {
    res.json({ error: "Service unavailable" })
   }

   removeFile(sessionPath)

  }

 }

 await RAVEN()

})

module.exports = router

