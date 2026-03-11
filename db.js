const { MongoClient } = require("mongodb")

const uri = process.env.MONGO_URI
const client = new MongoClient(uri)

let db

async function connectDB() {
  if (!db) {
    await client.connect()
    db = client.db("whatsapp_sessions")
    console.log("✅ MongoDB connected")
  }
  return db
}

module.exports = connectDB
