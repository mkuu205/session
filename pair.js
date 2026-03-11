const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')

const connectDB = require('./db')

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
  let num = req.query.number

  if (!num) {
    return res.send({
      error: "Missing number. Example: ?number=254712345678"
    })
  }

  num = num.replace(/[^0-9]/g, '')

  const sessionPath = path.join(tempDir, id)

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

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
    })

    client.ev.on('creds.update', saveCreds)

    client.ev.on('connection.update', async (update) => {

      const { connection } = update

      if (connection === "open") {

        const db = await connectDB()

        const credsPath = path.join(sessionPath, "creds.json")

        let sessionData = JSON.parse(fs.readFileSync(credsPath))

        const sessionId = crypto.randomBytes(16).toString("hex")

        await db.collection("sessions").insertOne({
          id: sessionId,
          session: sessionData
        })

        const shortSession = "kish_" + sessionId

        const msg = await client.sendMessage(client.user.id, {
          text: shortSession
        })

        await client.sendMessage(client.user.id, {
          text:
            "`Session generated successfully!`\n\n" +
            "Do NOT share this session ID.\n\n" +
            "Example:\nSESSION=" + shortSession
        }, { quoted: msg })

        await delay(2000)

        await client.ws.close()

        removeFile(sessionPath)

      }

    })

    if (!client.authState.creds.registered) {

      await delay(3000)

      const code = await client.requestPairingCode(num)

      res.send({ code })

    }

  } catch (err) {

    console.log(err)

    removeFile(sessionPath)

    res.send({
      error: "Service unavailable"
    })

  }

})

module.exports = router
