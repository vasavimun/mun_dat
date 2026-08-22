const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(express.json());

if (!process.env.DATABASE) {
  console.error("Missing DATABASE environment variable");
  process.exit(1);
}

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  // Preserve the connection across module reloads in dev (HMR)
  if (!global._mongoClientPromise) {
    client = new MongoClient(process.env.DATABASE, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(process.env.DATABASE, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  clientPromise = client.connect();
}

async function getCollections() {
  const connectedClient = await clientPromise;
  const database = connectedClient.db("MUN");
  return {
    registrationsCollection: database.collection("Registrations"),
    upiCollection: database.collection("UPI_IDs"),
    groupCollection: database.collection("Groups"),
  };
}

// 🔹 Insert new UPI IDs
app.post("/upi/add", async (req, res) => {
  try {
    const { upiCollection } = await getCollections();
    const { upiData, recipient } = req.body;

    const result = await upiCollection.insertOne({ upiData, recipient, count: 0 });
    res.status(201).json({ message: "UPI ID added successfully", id: result.insertedId });
  } catch (error) {
    console.error("Error adding UPI ID:", error);
    res.status(500).json({ error: "Error adding UPI ID" });
  }
});

// 🔹 Get all registrations
app.get("/registrations", async (req, res) => {
  try {
    const { registrationsCollection } = await getCollections();
    const registrations = await registrationsCollection.find({}).toArray();
    res.json(registrations);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Error fetching registrations" });
  }
});

// 🔹 Get an available UPI ID (count < 20)
app.get("/upi/available", async (req, res) => {
  try {
    const { upiCollection } = await getCollections();
    let upi = await upiCollection.findOne({ count: { $lt: 20 } });

    if (!upi) {
      await upiCollection.updateMany({}, { $set: { count: 0 } });
      upi = await upiCollection.findOne({});
    }

    if (!upi) {
      return res.status(404).json({ error: "No UPI IDs configured" });
    }

    res.json(upi);
  } catch (error) {
    console.error("Error fetching UPI ID:", error);
    res.status(500).json({ error: "Error fetching UPI ID" });
  }
});

// 🔹 Register a new user
app.post("/register", async (req, res) => {
  try {
    const { registrationsCollection } = await getCollections();
    const registrationData = req.body;

    await registrationsCollection.insertOne(registrationData);

    res.status(201).json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Error registering user" });
  }
});

app.post("/groupregister", async (req, res) => {
  try {
    const registerdata = req.body;
    const { groupCollection } = await getCollections();
    await groupCollection.insertOne(registerdata);
    res.status(201).json({ message: "Group Registration successful" });
  } catch (error) {
    console.error("Error registering group:", error);
    res.status(500).json({ error: "Error registering group" });
  }
});

app.get("/groups", async (req, res) => {
  try {
    const { groupCollection } = await getCollections();
    const groups = await groupCollection.find({}).toArray();
    res.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: "Error fetching groups" });
  }
});

app.get("/", (req, res) => {
  return res.json({ message: "MUN server is up and running" });
});

app.get("/health", (req, res) => {
  return res.json({ message: "Working" });
});

// 🔹 Handle Vercel's serverless functions
module.exports = app;

if (process.env.NODE_ENV !== "vercel") {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}