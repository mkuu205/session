const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("❌ MONGO_URI not set");
  process.exit(1);
}

const client = new MongoClient(uri);

let db = null;

async function connectDB() {
  try {
    if (!db) {
      await client.connect();
      db = client.db("whatsapp_sessions");
      console.log("✅ MongoDB connected");
    }
    return db;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    throw error;
  }
}

module.exports = connectDB;
