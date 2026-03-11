const express = require('express')
const path = require('path')
const connectDB = require('./db')

const app = express()
const PORT = process.env.PORT || 10000

require('events').EventEmitter.defaultMaxListeners = 500

/* connect database */

connectDB()

/* routes */

const qrRoutes = require('./qr')
const codeRoutes = require('./pair')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/qr', qrRoutes)
app.use('/code', codeRoutes)

/* SESSION FETCH */

app.get('/session/:id', async (req, res) => {

  const db = await connectDB()

  const session = await db.collection("sessions")
  .findOne({ id: req.params.id })

  if (!session) {
    return res.status(404).json({ error: "Session not found" })
  }

  res.json(session.session)

})

/* HTML pages */

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

app.listen(PORT, () => {
  console.log(`📡 Session Generator running on port ${PORT}`)
})
