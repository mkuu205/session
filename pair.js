
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

function makeid(length = 6) {
 const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
 let result = ""
 for (let i = 0; i < length; i++) {
  result += chars.charAt(Math.floor(Math.random() * chars.length))
 }
 return result
}

function removeFile(dir) {
 if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
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
   logger: pino({ level: "silent" }),
   printQRInTerminal: false,
   browser: Browsers.windows("Chrome"),
   auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
   }
  })

  client.ev.on("creds.update", saveCreds)

  if (!client.authState.creds.registered) {

   await delay(1500)

   const code = await client.requestPairingCode(num)

   res.json({ code })
  }

  client.ev.on("connection.update", async (update) => {

   const { connection } = update

   if (connection === "open") {

    console.log("✅ Connected")

    const credsPath = path.join(sessionPath, "creds.json")

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

    const compressed = zlib.gzipSync(sessionData)

    const session = "kish~" + compressed.toString("base64")

    await client.sendMessage(client.user.id, {
     text: session
    })

    await client.sendMessage(client.user.id, {
     text: "*KISH-MD Successfully Linked ✅*\n\nDo not share this session with anyone."
    })

    await delay(2000)

    await client.ws.close()

    removeFile(sessionPath)
   }

  })

 } catch (err) {

  console.log("Pair error:", err)

  removeFile(sessionPath)

  if (!res.headersSent) {
   res.json({
    error: "Service temporarily unavailable"
   })
  }

 }

})

module.exports = router
