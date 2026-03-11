const { makeid } = require('./id')
const express = require('express')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const QRCode = require('qrcode')

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

function removeFile(p){
if(!fs.existsSync(p)) return
fs.rmSync(p,{recursive:true,force:true})
}

router.get('/', async (req,res)=>{

const id = makeid()

/* LOADING SCREEN */

res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Kish-MD | Preparing QR</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>

body{
display:flex;
justify-content:center;
align-items:center;
height:100vh;
margin:0;
background:#000;
font-family:Arial;
color:white;
text-align:center;
}

.container{
max-width:400px;
}

.loader{
width:80px;
height:80px;
border-radius:50%;
border:6px solid rgba(255,255,255,0.1);
border-top:6px solid #9d50bb;
animation:spin 1s linear infinite;
margin:30px auto;
}

@keyframes spin{
0%{transform:rotate(0deg);}
100%{transform:rotate(360deg);}
}

h1{
font-size:28px;
margin-bottom:10px;
}

p{
color:#aaa;
}

.dots span{
animation:blink 1.4s infinite;
font-weight:bold;
}

.dots span:nth-child(2){
animation-delay:0.2s;
}

.dots span:nth-child(3){
animation-delay:0.4s;
}

@keyframes blink{
0%,80%,100%{opacity:0;}
40%{opacity:1;}
}

</style>
</head>

<body>

<div class="container">

<h1>Kish-MD</h1>

<div class="loader"></div>

<p>
Preparing QR Code
<span class="dots">
<span>.</span>
<span>.</span>
<span>.</span>
</span>
</p>

</div>

</body>
</html>
`)

async function RAVEN(){

const sessionPath = path.join(tempDir,id)

const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

try{

const client = makeWASocket({
auth:{
creds: state.creds,
keys: makeCacheableSignalKeyStore(
state.keys,
pino({level:"fatal"})
)
},
logger:pino({level:"silent"}),
printQRInTerminal:false,
browser:Browsers.macOS("Desktop")
})

client.ev.on('creds.update', saveCreds)

client.ev.on("connection.update", async(update)=>{

const {connection,lastDisconnect,qr} = update

/* QR GENERATED */

if(qr){

const qrImage = await QRCode.toDataURL(qr)

/* send QR page */

res.write(`
<script>
document.body.innerHTML=\`

<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;font-family:Arial;color:white;text-align:center;padding:20px;box-sizing:border-box">

<div style="max-width:600px;width:100%">

<h1 style="font-size:28px;font-weight:800">Kish-MD QR CODE</h1>

<div style="margin:20px auto;width:300px;height:300px">

<div style="width:300px;height:300px;padding:10px;background:white;border-radius:20px;box-shadow:0 0 0 10px rgba(255,255,255,0.1),0 0 0 20px rgba(255,255,255,0.05),0 0 30px rgba(255,255,255,0.2)">

<img src="${qrImage}" style="width:100%;height:100%">

</div>

</div>

<p style="color:#ccc">Scan this QR code with WhatsApp to connect</p>

<a href="./" style="display:inline-block;padding:12px 25px;margin-top:15px;background:linear-gradient(135deg,#6e48aa 0%,#9d50bb 100%);color:white;text-decoration:none;border-radius:30px;font-weight:bold">Back</a>

</div>

</div>
\`
</script>
`)

}

/* CONNECTED */

if(connection==="open"){

console.log("Connected")

await client.sendMessage(client.user.id,{
text:"Generating your session_id... please wait"
})

await delay(5000)

const credsPath = path.join(sessionPath,"creds.json")

const data = fs.readFileSync(credsPath)

const session = Buffer.from(data).toString("base64")

const msg = await client.sendMessage(client.user.id,{
text: session
})

await client.sendMessage(client.user.id,{
text:
`Kish-MD has been linked to your WhatsApp account!

Do NOT share this session ID with anyone.

Paste it in SESSION during deploy.

Enjoy using Kish-MD 🎉`
},{quoted:msg})

await delay(2000)

await client.ws.close()

await delay(3000)

removeFile(sessionPath)

}

/* CONNECTION CLOSED */

if(connection==="close"){

const code = lastDisconnect?.error?.output?.statusCode

console.log("Connection closed:",code)

if(code!==401){
await delay(5000)
RAVEN()
}else{
removeFile(sessionPath)
}

}

})

}catch(err){

console.log(err)

removeFile(sessionPath)

}

}

RAVEN()

})

module.exports = router
