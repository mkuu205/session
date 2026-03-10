
const express = require("express")
const fs = require("fs")
const path = require("path")
const pino = require("pino")
const zlib = require("zlib")

const {
 default: makeWASocket,
 useMultiFileAuthState,
 fetchLatestBaileysVersion,
 makeCacheableSignalKeyStore,
 Browsers,
 delay
} = require("@whiskeysockets/baileys")

const router = express.Router()

/* Generate random ID for temp session folder */
function makeid(length = 6) {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
 let result = ""
 for (let i = 0; i < length; i++) {
  result += chars.charAt(Math.floor(Math.random() * chars.length))
 }
 return result
}

/* Remove temp session folder */
function removeFile(dir) {
 if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true })
 }
}

router.get("/", async (req, res) => {

 const id = makeid()
 const sessionPath = path.join(__dirname, "temp", id)

 let num = req.query.number

 if (!num) {
  return res.json({
   error: "Missing number. Example: ?number=254712345678"
  })
 }

 num = num.replace(/[^0-9]/g, "")

 try {

  const { version } = await fetchLatestBaileysVersion()

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

  const client = makeWASocket({
   version,
   printQRInTerminal: false,
   logger: pino({ level: "silent" }),
   browser: Browsers.windows("Chrome"),

   auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
   }
  })

  client.ev.on("creds.update", saveCreds)

  /* Generate pairing code */
  if (!state.creds.registered) {

   await delay(2000)

   const code = await client.requestPairingCode(num)

   if (!res.headersSent) {
    res.json({ code })
   }

  }

  client.ev.on("connection.update", async (update) => {

   const { connection, lastDisconnect } = update

   if (connection === "open") {

    console.log("✅ WhatsApp Connected")

    const credsPath = path.join(sessionPath, "creds.json")

    let sessionData = null

    /* Wait until creds.json is written */
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

    /* Compress session */
    const compressed = zlib.gzipSync(sessionData)

    const session = "kish~" + compressed.toString("base64")

    /* Send session to WhatsApp */
    await client.sendMessage(client.user.id, {
     text: session
    })

    await client.sendMessage(client.user.id, {
     text: "*KISH-MD linked successfully ✅*\n\nKeep this session safe."
    })

    await delay(2000)

    await client.ws.close()

    removeFile(sessionPath)

   }

   if (connection === "close") {

    const code = lastDisconnect?.error?.output?.statusCode

    console.log("Connection closed:", code)

    removeFile(sessionPath)

   }

  })

 } catch (err) {

  console.log("Pairing error:", err)

  removeFile(sessionPath)

  if (!res.headersSent) {
   res.json({
    error: "Service temporarily unavailable"
   })
  }

 }

})

module.exports = router
