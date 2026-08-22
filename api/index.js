const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const uri = process.env.DATABASE;
if (!uri) {
  console.error("Missing DATABASE environment variable");
  process.exit(1);
}

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function connectToMongoDB() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB!");
//   } catch (error) {
//     console.error("❌ Failed to connect to MongoDB", error);
//     process.exit(1);
//   }
// }

// connectToMongoDB();

// // Dynamic collection reference (ensures fresh connections)
// function getCollections() {
//   const database = client.db("MUN");
//   return {
//     registrationsCollection: database.collection("Registrations"),
//     upiCollection: database.collection("UPI_IDs"),
//     groupCollection: database.collection("Groups"),
//   };
// }

let client;
let clientPromise;

if (!process.env.DATABASE) {
  console.error("Missing DATABASE environment variable");
  process.exit(1);
}

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
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
  // In production mode, it's best to not use a global variable.
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
    const { upiCollection } = getCollections();
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
    // Add "await" here
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
    const { upiCollection } = getCollections();
    let upi = await upiCollection.findOne({ count: { $lt: 20 } });

    if (!upi) {
      await upiCollection.updateMany({}, { $set: { count: 0 } });
      upi = await upiCollection.findOne({});
    }

    res.json(upi);
  } catch (error) {
    console.error("Error fetching UPI ID:", error);
    res.status(500).json({ error: "Error fetching UPI ID" });
  }
});

// 🔹 Register a new user and update UPI count
app.post("/register", async (req, res) => {
  try {
    const { registrationsCollection, upiCollection } = getCollections();
    const registrationData = req.body;
    const { upiData } = registrationData;

    const upi = await upiCollection.findOne({ upiData });
    if (!upi) return res.status(400).json({ error: "UPI ID not found" });

    await registrationsCollection.insertOne(registrationData);
    await upiCollection.updateOne({ upiData }, { $inc: { count: 1 } });

    res.status(201).json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Error registering user" });
  }
});
app.post("/groupregister", async (req, res) => {
  try{
    const registerdata = req.body;
    const { groupCollection } = getCollections();
    await groupCollection.insertOne(registerdata);
    res.status(201).json({ message: "Group Registration successful" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Error registering user" });
  }
});
app.get("/groups", async (req, res) => {
  try {
    const { groupCollection } = getCollections();
    const groups = await groupCollection.find({}).toArray();
    res.json(groups);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Error fetching registrations" });
  }
});


app.get("/", (req, res)=>{
  return res.json({"message": "MUN server is up and running"})
})

app.get("/health", (req, res) => {
  return res.json({ message: "Working" });
});

// 🔹 Handle Vercel's serverless functions
module.exports = app;

if (process.env.NODE_ENV !== "vercel") {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}
