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
DisconnectReason
} = require('@whiskeysockets/baileys')

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
            error: 'Missing number. Example: ?number=254712345678'
        })
    }

    num = num.replace(/[^0-9]/g, '')
    
    // Validate phone number
    if (num.length < 10 || num.length > 15) {
        return res.send({
            error: 'Invalid phone number format'
        })
    }

    const sessionPath = `./temp/${id}`

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

        let pairingRequested = false
        let responseSent = false
        let connectionTimeout = setTimeout(() => {
            if (!responseSent && !pairingRequested) {
                responseSent = true
                res.send({ error: 'Connection timeout' })
                sock?.ws?.close()
                removeFile(sessionPath)
            }
        }, 60000) // 60 second timeout

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.windows('Chrome'),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            generateHighQualityLink: false, // Prevents some connection issues
            defaultQueryTimeoutMs: 60000,
            // Important: Add retry logic
            retryRequestDelayMs: 1000,
            maxRetries: 3
        })

        sock.ev.on('creds.update', saveCreds)

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            if (connection === 'connecting') {
                console.log('🔄 Connecting to WhatsApp...')
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut
                
                console.log(`Connection closed: ${statusCode || 'unknown'}`)
                
                if (statusCode === 405 || statusCode === 428) {
                    console.log('Rate limited or blocked. Please wait before trying again.')
                    if (!responseSent) {
                        responseSent = true
                        res.send({ 
                            error: 'WhatsApp is temporarily blocking connection attempts. Please wait 30 minutes and try again with a different phone number.' 
                        })
                    }
                    removeFile(sessionPath)
                }
                
                if (shouldReconnect && !responseSent) {
                    console.log('Attempting to reconnect...')
                }
            }

            if (connection === 'open') {
                console.log('✅ Connection Open')
                clearTimeout(connectionTimeout)

                if (!pairingRequested && !sock.authState.creds.registered) {
                    pairingRequested = true

                    try {
                        await delay(3000) // Give connection time to stabilize
                        
                        console.log('📱 Requesting pairing code for:', num)
                        
                        const code = await sock.requestPairingCode(num)
                        
                        console.log('✅ Pairing code generated:', code)
                        
                        if (!res.headersSent && !responseSent) {
                            responseSent = true
                            res.send({ 
                                code: code,
                                message: 'Enter this code in your WhatsApp linked devices'
                            })
                        }

                        // Set timeout to close connection after sending code
                        setTimeout(async () => {
                            try {
                                await sock.ws.close()
                                await delay(1000)
                                removeFile(sessionPath)
                            } catch (err) {
                                console.log('Cleanup error:', err.message)
                            }
                        }, 10000)

                    } catch (err) {
                        console.log('❌ Pairing error:', err.message)
                        
                        if (!res.headersSent && !responseSent) {
                            responseSent = true
                            res.send({ 
                                error: `Failed to generate pairing code: ${err.message}`
                            })
                        }
                        
                        await sock.ws.close()
                        removeFile(sessionPath)
                    }
                }
            }
        })

        // Handle session generation
        const credsUpdateHandler = async () => {
            try {
                const credsPath = `${sessionPath}/creds.json`
                
                if (!fs.existsSync(credsPath)) return

                const data = fs.readFileSync(credsPath)
                const compressed = zlib.gzipSync(data)
                const base64 = compressed.toString('base64')
                const session = `Kish~${base64}`

                // Wait for user to be registered
                if (sock.user?.id) {
                    await sock.sendMessage(sock.user.id, { text: session })
                    
                    await delay(2000)
                    
                    await sock.ws.close()
                    removeFile(sessionPath)
                }
            } catch (err) {
                console.log('Session generation error:', err.message)
            }
        }

        sock.ev.on('creds.update', credsUpdateHandler)

    } catch (error) {
        console.log('Setup error:', error.message)
        if (!res.headersSent) {
            res.send({ error: 'Failed to initialize connection' })
        }
        removeFile(sessionPath)
    }
})

module.exports = router
