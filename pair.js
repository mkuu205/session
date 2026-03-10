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
} = require('@whiskeysockets/baileys')

const router = express.Router()

function removeFile(path){
if(!fs.existsSync(path)) return
fs.rmSync(path,{recursive:true,force:true})
}

router.get('/', async (req,res)=>{

const id = makeid()
let num = req.query.number

if(!num){
return res.send({
error:'Missing number. Example: ?number=254712345678'
})
}

num = num.replace(/[^0-9]/g,'')

async function KISH(){

const sessionPath = `./temp/${id}`

const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

try{

const client = makeWASocket({

auth:{
creds:state.creds,
keys:makeCacheableSignalKeyStore(
state.keys,
pino({level:'fatal'})
)
},

printQRInTerminal:false,
logger:pino({level:'silent'}),
browser:Browsers.windows('Chrome'),

connectTimeoutMs:60000,
keepAliveIntervalMs:10000

})

client.ev.on('creds.update',saveCreds)

client.ev.on('connection.update',async(update)=>{

const { connection,lastDisconnect } = update

if(connection==='connecting'){
console.log('🔄 Connecting to WhatsApp...')
}

if(connection==='open'){

console.log('✅ Connection Open')

if(!client.authState.creds.registered){

await delay(10000)

try{

const code = await client.requestPairingCode(num,'KISHTECH')

if(!res.headersSent){
res.send({code})
}

}catch(err){

console.log('Pairing failed:',err.message)

}

}

await client.sendMessage(client.user.id,{
text:'Generating your session...'
})

await delay(5000)

const credsPath = `${sessionPath}/creds.json`

if(!fs.existsSync(credsPath)){
console.log('creds.json not found')
return
}

const data = fs.readFileSync(credsPath)

const compressed = zlib.gzipSync(data)
const base64 = compressed.toString('base64')

const finalSession = `Kish~${base64}`

const sessionMsg = await client.sendMessage(client.user.id,{
text:finalSession
})

await client.sendMessage(
client.user.id,
{
text:`Kish-MD has been linked to your WhatsApp account!

Do NOT share this SESSION_ID with anyone.

Paste it in SESSION during deploy.

Good luck 🎉`
},
{quoted:sessionMsg}
)

await delay(2000)

await client.ws.close()

removeFile(sessionPath)

}

if(connection==='close'){

const code = lastDisconnect?.error?.output?.statusCode

console.log('Connection closed:',code)

if(code!==401){

console.log('🔁 Reconnecting...')
await delay(5000)
KISH()

}else{

removeFile(sessionPath)

}

}

})

}catch(err){

console.log('service restarted',err)

removeFile(sessionPath)

if(!res.headersSent){

res.send({
code:'Service Currently Unavailable'
})

}

}

}

await KISH()

})

module.exports = router
