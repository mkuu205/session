const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')

const { connectDB } = require('./index')

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

  async function START() {

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

        const { connection, lastDisconnect } = update

        if (connection === "open") {

          const db = await connectDB()

          await client.sendMessage(client.user.id, {
            text: "Generating your session..."
          })

          const credsPath = path.join(sessionPath, "creds.json")

          let sessionData = null

          while (!sessionData) {

            if (fs.existsSync(credsPath)) {

              const raw = fs.readFileSync(credsPath)

              if (raw && raw.length > 100) {
                sessionData = JSON.parse(raw)
                break
              }

            }

            await delay(1000)

          }

          const sessionId = crypto.randomBytes(16).toString("hex")

          await db.collection("sessions").insertOne({
            id: sessionId,
            session: sessionData
          })

          const shortSession = "kish_" + sessionId

          const session = await client.sendMessage(client.user.id, {
            text: shortSession
          })

          await client.sendMessage(client.user.id, {
            text:
              "`Kish-MD linked successfully!\n\n" +
              "Do NOT share this session.\n\n" +
              "Example:\nSESSION=" + shortSession + "`"
          }, { quoted: session })

          await delay(2000)

          await client.ws.close()

          await delay(3000)

          removeFile(sessionPath)

        }

        if (connection === "close") {

          const code = lastDisconnect?.error?.output?.statusCode

          if (code !== 401) {
            await delay(5000)
            START()
          } else {
            await delay(3000)
            removeFile(sessionPath)
          }

        }

      })

      if (!client.authState.creds.registered) {

        await delay(3000)

        const code = await client.requestPairingCode(num, "KISHTECH")

        if (!res.headersSent) {
          res.send({ code })
        }

      }

    } catch (err) {

      console.log(err)

      await delay(3000)

      removeFile(sessionPath)

      if (!res.headersSent) {
        res.send({
          code: "Service Currently Unavailable"
        })
      }

    }

  }

  await START()

})

module.exports = router
