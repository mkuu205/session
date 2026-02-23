const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const crypto = require('crypto');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const router = express.Router();

/* ---------------- UTILITIES ---------------- */

function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
}

function generateShortSessionId() {
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `Kish-MD-${randomPart}`;
}

/* ---------------- ROUTE ---------------- */

router.get('/', async (req, res) => {

    if (!req.query.number) {
        return res.send({ error: "Number query missing. Use ?number=2547xxxxxxx" });
    }

    const id = makeid();
    let num = req.query.number.replace(/[^0-9]/g, '');

    async function startSocket() {

        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {

            const client = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Edge'),
            });

            /* ---------- PAIRING ---------- */

            if (!client.authState.creds.registered) {
                await delay(1200);
                const code = await client.requestPairingCode(num, "KISHBOT1");

                if (!res.headersSent) res.send({ code });
            }

            client.ev.on('creds.update', saveCreds);

            /* ---------- CONNECTION EVENTS ---------- */

            client.ev.on('connection.update', async (update) => {

                const { connection, lastDisconnect, receivedPendingNotifications } = update;

                // reconnect unless logged out
                if (connection === 'close') {
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        console.log('Reconnecting socket...');
                        return startSocket();
                    }
                    return;
                }

                // IMPORTANT: only send after full sync
                if (connection === 'open' && receivedPendingNotifications) {

                    console.log("Device fully initialized");

                    try {

                        const jid = client.user.id;

                        await client.sendMessage(jid, {
                            text: "Generating your session wait a moment..."
                        });

                        await delay(1200);

                        const shortSessionId = generateShortSessionId();

                        const msg = await client.sendMessage(jid, {
                            text: `Your session ID: *${shortSessionId}*`
                        });

                        await client.sendMessage(jid, {
                            text: "```Kish-MD linked successfully.\nUse this session during deployment.```"
                        }, { quoted: msg });

                        // allow WhatsApp to ACK messages
                        await delay(2500);

                        await client.logout();
                        removeFile(`./temp/${id}`);

                    } catch (err) {
                        console.log("SEND ERROR:", err);
                    }
                }

            });

        } catch (err) {
            console.log('Service crashed:', err);
            removeFile('./temp/' + id);

            if (!res.headersSent) {
                res.send({ error: 'Service temporarily unavailable' });
            }
        }
    }

    await startSocket();
});

module.exports = router;
