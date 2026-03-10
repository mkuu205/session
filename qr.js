const { makeid } = require('./id')
const QRCode = require('qrcode')
const express = require('express')
const fs = require('fs')
const pino = require('pino')
const zlib = require('zlib')

const {
default: makeWASocket,
useMultiFileAuthState,
Browsers,
delay
} = require('@whiskeysockets/baileys')

const router = express.Router()

function removeFile(path){
if(!fs.existsSync(path)) return
fs.rmSync(path,{recursive:true,force:true})
}

router.get('/',async(req,res)=>{

const id = makeid()

async function KISH(){

const { state, saveCreds } = await useMultiFileAuthState('./temp/'+id)

try{

const client = makeWASocket({

auth:state,
printQRInTerminal:false,
logger:pino({level:'silent'}),
browser:Browsers.macOS('Desktop'),

connectTimeoutMs:60000,
keepAliveIntervalMs:10000

})

client.ev.on('creds.update',saveCreds)

client.ev.on('connection.update',async(update)=>{

const { connection,lastDisconnect,qr } = update

if(qr && !res.headersSent){

const qrImage = await QRCode.toDataURL(qr)

return res.send(`
<!DOCTYPE html>
<html>
<head>
<title>KISH-MD | QR</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{
display:flex;
justify-content:center;
align-items:center;
height:100vh;
background:#000;
color:white;
font-family:Arial;
text-align:center
}

.qr{
background:white;
padding:15px;
border-radius:20px
}

img{
width:250px
}

button{
margin-top:20px;
padding:10px 20px;
border:none;
border-radius:20px;
background:#8a2be2;
color:white
}
</style>
</head>

<body>

<div>
<h2>KISH-MD QR LOGIN</h2>

<div class="qr">
<img src="${qrImage}">
</div>

<p>Scan with WhatsApp</p>

<button onclick="location.href='/'">Back</button>

</div>

</body>
</html>
`)
}

if(connection==='open'){

console.log('✅ QR connected')

await client.sendMessage(client.user.id,{
text:'Generating your session...'
})

await delay(50000)

const credsPath = `./temp/${id}/creds.json`

if(!fs.existsSync(credsPath)) return

const data = fs.readFileSync(credsPath)

const compressed = zlib.gzipSync(data)
const base64 = compressed.toString('base64')

const session = `Kish~${base64}`

const msg = await client.sendMessage(client.user.id,{
text:session
})

await client.sendMessage(
client.user.id,
{
text:`Kish-MD has been linked to your WhatsApp account.

Do NOT share this SESSION_ID.

Paste it inside SESSION when deploying the bot.`
},
{quoted:msg}
)

await delay(2000)

await client.ws.close()

removeFile(`./temp/${id}`)

}

if(connection==='close'){

const code = lastDisconnect?.error?.output?.statusCode

console.log('Connection closed:',code)

if(code!==401){

await delay(10000)
KISH()

}else{

removeFile(`./temp/${id}`)

}

}

})

}catch(err){

console.log(err)

if(!res.headersSent){
res.send('Service Unavailable')
}

removeFile(`./temp/${id}`)

}

}

KISH()

})

module.exports = router
