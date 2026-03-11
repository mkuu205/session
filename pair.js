
const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')
const connectDB = require('./mongo')

const {
 default: makeWASocket,
 useMultiFileAuthState,
 Browsers,
 delay,
 makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const router = express.Router()

const tempDir = path.join(__dirname, "temp")
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

function removeFile(p) {
 if (!fs.existsSync(p)) return
 fs.rmSync(p, { recursive: true, force: true })
}

router.get('/', async (req, res) => {

 const id = makeid()
 let num = req.query.number

 if (!num) {
  return res.json({ error: "Missing number. Example: ?number=254712345678" })
 }

 num = num.replace(/[^0-9]/g, '')

 const sessionPath = path.join(tempDir, id)
 if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true })

 const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

 try {

  const client = makeWASocket({
   auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
   },
   printQRInTerminal: false,
   logger: pino({ level: "silent" }),
   browser: Browsers.windows("Chrome")
  })

  client.ev.on("creds.update", saveCreds)

  let pairingSent = false

  client.ev.on("connection.update", async (update) => {

   const { connection } = update

   if (connection === "connecting") {
    console.log("🔄 Connecting to WhatsApp...")
   }

   if (!client.authState.creds.registered && !pairingSent) {

    pairingSent = true

    await delay(2000)

    const code = await client.requestPairingCode(num)

    console.log("Pair code:", code)

    if (!res.headersSent) {
     res.json({ code })
    }

   }

   if (connection === "open") {

    console.log("✅ WhatsApp linked")

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

    if (!sessionData) throw new Error("Failed to read session")

    const sessionId = crypto.randomBytes(16).toString("hex")

    const db = await connectDB()

    await db.collection("sessions").insertOne({
     sessionId: sessionId,
     creds: sessionData,
     createdAt: new Date()
    })

    const shortSession = "kish_" + sessionId

    const msg = await client.sendMessage(client.user.id, {
     text: shortSession
    })

    await client.sendMessage(client.user.id,{
     text:
      "Kish-MD linked successfully.\n\n" +
      "Do NOT share this session ID.\n\n" +
      "Example:\nSESSION=" + shortSession
    },{ quoted: msg })

    await delay(2000)

    await client.ws.close()

    await delay(2000)

    removeFile(sessionPath)
   }

  })

 } catch (err) {

  console.log("Pairing error:", err)

  removeFile(sessionPath)

  if (!res.headersSent) {
   res.json({ error: "Service unavailable" })
  }

 }

})

module.exports = router
