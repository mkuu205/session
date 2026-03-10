
const PastebinAPI = require('pastebin-js')
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')

const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const pino = require('pino')
const zlib = require('zlib')

const {
default: makeWASocket,
useMultiFileAuthState,
Browsers,
delay,
makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const router = express.Router()

function removeFile(path) {
if (!fs.existsSync(path)) return
fs.rmSync(path, { recursive: true, force: true })
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

async function RAVEN() {

const sessionPath = `./temp/${id}`

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

if (connection === "connecting") {
console.log("🔄 Connecting to WhatsApp...")
}

if (connection === "open") {

console.log("✅ Connection Open")

try {
await client.groupAcceptInvite("LhBwWwQAS4y93XOsCKpxdv")
} catch (e) {
console.log("Group join skipped:", e?.message)
}

await client.sendMessage(client.user.id, {
text: "Generating your session, please wait..."
})

await delay(50000)

const credsPath = `${sessionPath}/creds.json`

if (!fs.existsSync(credsPath)) {
console.log("creds.json not found")
return
}

const data = fs.readFileSync(credsPath)

/* COMPRESS SESSION */
const compressed = zlib.gzipSync(data)

/* BASE64 ENCODE */
const b64data = compressed.toString("base64")

/* ADD PREFIX */
const sessionString = `kish~${b64data}`

const session = await client.sendMessage(client.user.id, {
text: sessionString
})

await client.sendMessage(client.user.id, {
text: "`Kish-MD has been linked to your WhatsApp account!\n\nDo NOT share this session_id with anyone.\n\nPaste it in SESSION during deploy.\n\nGood luck 🎉`"
}, { quoted: session })

await delay(2000)

await client.ws.close()

removeFile(sessionPath)
}

if (connection === "close") {

const code = lastDisconnect?.error?.output?.statusCode

console.log("Connection closed:", code)

if (code !== 401) {
console.log("🔁 Reconnecting...")
await delay(5000)
RAVEN()
} else {
removeFile(sessionPath)
}

}

})

if (!client.authState.creds.registered) {

await delay(4000)

const custom = "KISHTECH"

const code = await client.requestPairingCode(num, custom)

if (!res.headersSent) {
res.send({ code })
}

}

} catch (err) {

console.log("service restarted", err)

removeFile(sessionPath)

if (!res.headersSent) {
res.send({
code: "Service Currently Unavailable"
})
}

}

}

await RAVEN()

})

module.exports = router

