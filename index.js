
const express = require('express')
const path = require('path')
const fs = require('fs')
const connectDB = require('./mongo')

const app = express()
const PORT = process.env.PORT || 8000

require('events').EventEmitter.defaultMaxListeners = 500

const qrRoutes = require('./qr')
const codeRoutes = require('./pair')

/* temp folder */

const tempDir = path.join(__dirname, "temp")

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

/* middleware */

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

/* API routes */

app.use('/qr', qrRoutes)
app.use('/code', codeRoutes)

/* SESSION DOWNLOAD FROM MONGODB */

app.get('/session/:id', async (req, res) => {

 try {

  const db = await connectDB()

  const session = await db.collection("sessions").findOne({
   sessionId: req.params.id
  })

  if (!session) {
   return res.status(404).json({ error: "Session not found" })
  }

  res.json(session.creds)

 } catch (err) {

  console.error("Session fetch error:", err.message)

  res.status(500).json({ error: "Database error" })

 }

})

/* HTML routes */

app.get('/pair', (req, res) => {
 res.sendFile(path.join(__dirname, 'pair.html'))
})

app.get('/fork-check', (req, res) => {
 res.sendFile(path.join(__dirname, 'fork-check.html'))
})

app.get('/', (req, res) => {
 res.sendFile(path.join(__dirname, 'main.html'))
})

/* error handler */

app.use((err, req, res, next) => {
 console.error("SERVER ERROR:", err.stack)
 res.status(500).send("Internal Server Error")
})

/* start server */

app.listen(PORT, () => {
 console.log(`📡 Session Generator running on http://localhost:${PORT}`)
})

module.exports = app
