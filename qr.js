const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const crypto = require('crypto')
const QRCode = require('qrcode')

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
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.windows('Edge')
      })

      client.ev.on('creds.update', saveCreds)

      client.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect, qr } = update

        if (qr && !res.headersSent) {

          const qrImage = await QRCode.toDataURL(qr)

          res.send(`<img src="${qrImage}" width="300"/>`)

        }

        if (connection === "open") {

          const db = await connectDB()

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

          await client.sendMessage(client.user.id, {
            text: shortSession
          })

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

    } catch (err) {

      console.log(err)

      await delay(3000)

      removeFile(sessionPath)

    }

  }

  await START()

})

module.exports = router
