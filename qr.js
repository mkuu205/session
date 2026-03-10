const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL');

const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const zlib = require("zlib");

const router = express.Router();

const {
default: RavenConnect,
useMultiFileAuthState,
Browsers,
delay
} = require("@whiskeysockets/baileys");

/* -------------------- DELETE TEMP SESSION -------------------- */

function removeFile(FilePath) {
if (!fs.existsSync(FilePath)) return;
fs.rmSync(FilePath, { recursive: true, force: true });
}

/* -------------------- QR ROUTE -------------------- */

router.get('/', async (req, res) => {

const id = makeid();

async function RAVEN() {

const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

try {

let client = RavenConnect({
auth: state,
printQRInTerminal: false,
logger: pino({ level: "silent" }),
browser: Browsers.macOS("Desktop")
});

client.ev.on('creds.update', saveCreds);

client.ev.on("connection.update", async (update) => {

const { connection, lastDisconnect, qr } = update;

/* -------------------- SHOW QR PAGE -------------------- */

if (qr) {

const qrImage = await QRCode.toDataURL(qr);

return res.send(`

<!DOCTYPE html>
<html>
<head>

<title>KISH-MD | QR CODE</title>

<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<style>

body{
display:flex;
justify-content:center;
align-items:center;
min-height:100vh;
margin:0;
background:#000;
font-family:Arial,sans-serif;
color:#fff;
text-align:center;
padding:20px;
box-sizing:border-box;
}

.container{
width:100%;
max-width:600px;
}

.qr-container{
position:relative;
margin:20px auto;
width:300px;
height:300px;
display:flex;
justify-content:center;
align-items:center;
}

.qr-code{
width:300px;
height:300px;
padding:10px;
background:white;
border-radius:20px;
box-shadow:
0 0 0 10px rgba(255,255,255,0.1),
0 0 0 20px rgba(255,255,255,0.05),
0 0 30px rgba(255,255,255,0.2);
}

.qr-code img{
width:100%;
height:100%;
}

h1{
margin:0 0 15px 0;
font-size:28px;
font-weight:800;
text-shadow:0 0 10px rgba(255,255,255,0.3);
}

p{
color:#ccc;
margin:20px 0;
font-size:16px;
}

.back-btn{
display:inline-block;
padding:12px 25px;
margin-top:15px;
background:linear-gradient(135deg,#6e48aa 0%,#9d50bb 100%);
color:white;
text-decoration:none;
border-radius:30px;
font-weight:bold;
transition:all .3s ease;
box-shadow:0 4px 15px rgba(0,0,0,0.2);
}

.back-btn:hover{
transform:translateY(-2px);
box-shadow:0 6px 20px rgba(0,0,0,0.3);
}

.pulse{
animation:pulse 2s infinite;
}

@keyframes pulse{
0%{box-shadow:0 0 0 0 rgba(255,255,255,0.4);}
70%{box-shadow:0 0 0 15px rgba(255,255,255,0);}
100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}
}

@media(max-width:480px){

.qr-container{
width:260px;
height:260px;
}

.qr-code{
width:220px;
height:220px;
}

h1{
font-size:24px;
}

}

</style>

</head>

<body>

<div class="container">

<h1>KISH-MD QR CODE</h1>

<div class="qr-container">
<div class="qr-code pulse">
<img src="${qrImage}" alt="QR Code"/>
</div>
</div>

<p>Scan this QR code with your phone to connect</p>

<a href="./" class="back-btn">Back</a>

</div>

</body>
</html>

`);
}

/* -------------------- WHEN CONNECTED -------------------- */

if (connection === "open") {

await client.sendMessage(client.user.id,{
text: "Generating your session_id... please wait"
});

await delay(5000);

const credsPath = `./temp/${id}/creds.json`;

if (!fs.existsSync(credsPath)) return;

const data = fs.readFileSync(credsPath);

/* compress session */

const compressed = zlib.gzipSync(data);

/* convert to base64 */

const base64Session = compressed.toString("base64");

/* final Kish session */

const sessionString = `Kish~${base64Session}`;

const session = await client.sendMessage(client.user.id,{
text: sessionString
});

const msg = `
Kish-MD has been linked to your WhatsApp account!

Do NOT share this SESSION_ID with anyone.

Paste it inside SESSION during deploy.

Good luck 🎉
`;

await client.sendMessage(
client.user.id,
{ text: msg },
{ quoted: session }
);

await delay(2000);

await client.ws.close();

removeFile(`./temp/${id}`);

}

/* -------------------- RECONNECT -------------------- */

if (
connection === "close" &&
lastDisconnect &&
lastDisconnect.error &&
lastDisconnect.error.output.statusCode !== 401
) {

await delay(10000);

RAVEN();

}

});

} catch(err){

console.log(err);

if(!res.headersSent){

res.json({
code:"Service Currently Unavailable"
});

}

removeFile(`./temp/${id}`);

}

}

return RAVEN();

});

module.exports = router;
