const PastebinAPI = require('pastebin-js')
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')

const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const pino = require('pino')

const {
default: makeWASocket,
useMultiFileAuthState,
Browsers,
delay,
makeCacheableSignalKeyStore,
fetchLatestBaileysVersion
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
error: "Provide number like ?number=254712345678"
})
}

num = num.replace(/[^0-9]/g, '')

async function RAVEN() {

const sessionPath = `./temp/${id}`

const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

try {

const { version } = await fetchLatestBaileysVersion()

const client = makeWASocket({

version,
printQRInTerminal: false,

auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(
state.keys,
pino({ level: "fatal" })
)
},

logger: pino({ level: "silent" }),
browser: Browsers.windows("Edge")

})

client.ev.on("creds.update", saveCreds)

client.ev.on("connection.update", async (update) => {

const { connection, lastDisconnect } = update

if (connection === "connecting") {
console.log("🔄 Connecting to WhatsApp...")
}

if (connection === "open") {

console.log("✅ Connected")

try {
await client.groupAcceptInvite("LhBwWwQAS4y93XOsCKpxdv")
} catch (e) {
console.log("Group join skipped:", e.message)
}

await client.sendMessage(client.user.id, {
text: "Generating your session, please wait..."
})

await delay(40000)

const data = fs.readFileSync(`${sessionPath}/creds.json`)

const b64data = Buffer.from(data).toString("base64")

const session = await client.sendMessage(client.user.id, {
text: b64data
})

await client.sendMessage(client.user.id, {
text: "```Kish-MD has been linked to your WhatsApp account.\n\nDo NOT share this session id.\n\nPaste it in SESSION during deploy.\n\nGood luck 🎉```"
}, { quoted: session })

await delay(1000)

await client.ws.close()

removeFile(sessionPath)

}

if (connection === "close") {

const status = lastDisconnect?.error?.output?.statusCode

console.log("Connection closed:", status)

if (status !== 401) {
await delay(5000)
RAVEN()
} else {
removeFile(sessionPath)
}

}

})

if (!client.authState.creds.registered) {

await delay(5000)

const code = await client.requestPairingCode(num, "KISHTECH")

if (!res.headersSent) {
res.send({ code })
}

}

} catch (err) {

console.log("Service restarted", err)

removeFile(sessionPath)

if (!res.headersSent) {
res.send({
code: "Service temporarily unavailable"
})
}

}

}

await RAVEN()

})

module.exports = router
