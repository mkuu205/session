const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const QRCode = require('qrcode')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const router = express.Router()

const tempDir = path.join(__dirname, "temp")

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

function removeFile(p) {
  if (!fs.existsSync(p)) return
  fs.rmSync(p, { recursive: true, force: true })
}

router.get('/', async (req, res) => {

  const id = makeid()

  async function RAVEN() {

    const sessionPath = path.join(tempDir, id)

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

    try {

      const client = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" })
          )
        },
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Desktop")
      })

      client.ev.on('creds.update', saveCreds)

      client.ev.on("connection.update", async (update) => {

        const { connection, lastDisconnect, qr } = update

        /* show QR */

        if (qr && !res.headersSent) {

          const qrImage = await QRCode.toDataURL(qr)

          res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Kish-MD | QR CODE</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
body {
display:flex;
justify-content:center;
align-items:center;
min-height:100vh;
margin:0;
background-color:#000;
font-family:Arial,sans-serif;
color:#fff;
text-align:center;
padding:20px;
box-sizing:border-box;
}

.container {
width:100%;
max-width:600px;
}

.qr-container {
position:relative;
margin:20px auto;
width:300px;
height:300px;
display:flex;
justify-content:center;
align-items:center;
}

.qr-code {
width:300px;
height:300px;
padding:10px;
background:white;
border-radius:20px;
box-shadow:
0 0 0 10px rgba(255,255,255,0.1),
0 0 0 20px rgba(255,255,255,0.05),
0 0 30px rgba(255,255,255,0.2);
}

.qr-code img {
width:100%;
height:100%;
}

h1 {
margin:0 0 15px 0;
font-size:28px;
font-weight:800;
text-shadow:0 0 10px rgba(255,255,255,0.3);
}

p {
color:#ccc;
margin:20px 0;
font-size:16px;
}

.back-btn {
display:inline-block;
padding:12px 25px;
margin-top:15px;
background:linear-gradient(135deg,#6e48aa 0%,#9d50bb 100%);
color:white;
text-decoration:none;
border-radius:30px;
font-weight:bold;
border:none;
cursor:pointer;
transition:all 0.3s ease;
box-shadow:0 4px 15px rgba(0,0,0,0.2);
}

.back-btn:hover {
transform:translateY(-2px);
box-shadow:0 6px 20px rgba(0,0,0,0.3);
}

.pulse {
animation:pulse 2s infinite;
}

@keyframes pulse {
0% { box-shadow:0 0 0 0 rgba(255,255,255,0.4); }
70% { box-shadow:0 0 0 15px rgba(255,255,255,0); }
100% { box-shadow:0 0 0 0 rgba(255,255,255,0); }
}

@media (max-width:480px) {
.qr-container { width:260px; height:260px; }
.qr-code { width:220px; height:220px; }
h1 { font-size:24px; }
}
</style>
</head>

<body>

<div class="container">

<h1>Kish-MD QR CODE</h1>

<div class="qr-container">
<div class="qr-code pulse">
<img src="${qrImage}" alt="QR Code"/>
</div>
</div>

<p>Scan this QR code with your WhatsApp to connect</p>

<a href="./" class="back-btn">Back</a>

</div>

<script>
document.querySelector('.back-btn').addEventListener('mousedown',function(){
this.style.transform='translateY(1px)'
this.style.boxShadow='0 2px 10px rgba(0,0,0,0.2)'
})

document.querySelector('.back-btn').addEventListener('mouseup',function(){
this.style.transform='translateY(-2px)'
this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)'
})
</script>

</body>
</html>
`)
        }

        /* connection open */

        if (connection === "open") {

          console.log("Connected")

          await client.sendMessage(client.user.id, {
            text: "Generating your session_id... please wait"
          })

          await delay(5000)

          const credsPath = path.join(sessionPath, "creds.json")

          const data = fs.readFileSync(credsPath)

          const session = Buffer.from(data).toString("base64")

          const msg = await client.sendMessage(client.user.id, {
            text: session
          })

          await client.sendMessage(client.user.id, {
            text:
`Kish-MD has been linked to your WhatsApp account!

Do NOT share this session ID with anyone.

Paste it in your deploy config as SESSION.

Enjoy using Kish-MD 🎉`
          }, { quoted: msg })

          await delay(2000)

          await client.ws.close()

          await delay(3000)

          removeFile(sessionPath)
        }

        /* reconnect logic */

        if (connection === "close") {

          const code = lastDisconnect?.error?.output?.statusCode

          console.log("Connection closed:", code)

          if (code !== 401) {
            await delay(5000)
            RAVEN()
          } else {
            removeFile(sessionPath)
          }

        }

      })

    } catch (err) {

      console.log(err)

      removeFile(sessionPath)

      if (!res.headersSent) {
        res.send({
          error: "Service Currently Unavailable"
        })
      }

    }

  }

  await RAVEN()

})

module.exports = router
