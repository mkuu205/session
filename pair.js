
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")
const zlib = require("zlib")

const {
 default: makeWASocket,
 useMultiFileAuthState,
 delay,
 fetchLatestBaileysVersion,
 makeCacheableSignalKeyStore,
 Browsers
} = require("@whiskeysockets/baileys")

const router = express.Router()

const sessionDir = path.join(__dirname, "session")

function makeid(length = 6) {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
 let result = ""
 for (let i = 0; i < length; i++) {
  result += chars.charAt(Math.floor(Math.random() * chars.length))
 }
 return result
}

function removeFile(dir) {
 if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true })
 }
}

router.get("/", async (req, res) => {

 const id = makeid()
 let num = req.query.number

 let responseSent = false
 let cleaned = false

 if (!num) {
  return res.json({
   error: "Missing number. Example: ?number=254712345678"
  })
 }

 num = num.replace(/[^0-9]/g, "")

 async function cleanup() {
  if (!cleaned) {
   removeFile(path.join(sessionDir, id))
   cleaned = true
  }
 }

 async function START_PAIR() {

  const { version } = await fetchLatestBaileysVersion()

  const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id))

  try {

   const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.windows("Chrome"),

    auth: {
     creds: state.creds,
     keys: makeCacheableSignalKeyStore(
      state.keys,
      pino({ level: "fatal" })
     )
    }
   })

   sock.ev.on("creds.update", saveCreds)

   /* REQUEST PAIRING CODE */

   if (!sock.authState.creds.registered) {

    await delay(1500)

    const custom = "KISHTECH"

    const code = await sock.requestPairingCode(num, custom)

    if (!responseSent && !res.headersSent) {
     res.json({ code })
     responseSent = true
    }

   }

   sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect } = update

    if (connection === "open") {

     console.log("✅ WhatsApp connected")

     await delay(5000)

     const credsPath = path.join(sessionDir, id, "creds.json")

     let sessionData = null
     let attempts = 0

     while (attempts < 10 && !sessionData) {

      if (fs.existsSync(credsPath)) {

       const data = fs.readFileSync(credsPath)

       if (data && data.length > 100) {
        sessionData = data
        break
       }

      }

      await delay(2000)
      attempts++
     }

     if (!sessionData) {
      await cleanup()
      return
     }

     /* COMPRESS SESSION */

     const compressed = zlib.gzipSync(sessionData)

     const session = "kish~" + compressed.toString("base64")

     await sock.sendMessage(sock.user.id, {
      text: session
     })

     await sock.sendMessage(sock.user.id, {
      text: "*KISH-MD successfully linked ✅*\n\nDo not share your session."
     })

     await delay(3000)

     await sock.ws.close()

     await cleanup()

    }

    if (
     connection === "close" &&
     lastDisconnect?.error?.output?.statusCode !== 401
    ) {

     console.log("Reconnecting...")

     await delay(4000)

     START_PAIR()

    }

   })

  } catch (err) {

   console.log("Pairing error:", err)

   if (!responseSent && !res.headersSent) {
    res.json({
     error: "Service unavailable"
    })
   }

   await cleanup()
  }

 }

 try {

  await START_PAIR()

 } catch (e) {

  console.log("Fatal error:", e)

  await cleanup()

  if (!responseSent && !res.headersSent) {
   res.json({
    error: "Service error"
   })
  }

 }

})

module.exports = router

