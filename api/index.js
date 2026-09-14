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

if (!global._mongoClientPromise) {
  client = new MongoClient(process.env.DATABASE, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

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

    // Get EVERY field from every document
    const columns = [
      ...new Set(
        registrations.flatMap((registration) =>
          Object.keys(registration)
        )
      )
    ];

    const escapeHtml = (value) => {
      if (value === null || value === undefined) return "";

      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const formatValue = (value, field) => {
      if (value === null || value === undefined) {
        return "";
      }

      // Google Drive link
      if (field === "driveLink" && value) {
        return `
          <a
            href="${escapeHtml(value)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Drive
          </a>
        `;
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return escapeHtml(value.join(", "));
      }

      // Handle objects such as MongoDB ObjectId
      if (typeof value === "object") {
        return escapeHtml(JSON.stringify(value));
      }

      // Handle boolean
      if (typeof value === "boolean") {
        return value ? "true" : "false";
      }

      return escapeHtml(value);
    };

    const tableRows = registrations
      .map(
        (registration) => `
          <tr>
            ${columns
              .map(
                (column) => `
                  <td>
                    ${formatValue(registration[column], column)}
                  </td>
                `
              )
              .join("")}
          </tr>
        `
      )
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">

        <title>Registrations</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
          }

          h1 {
            margin: 0 0 20px 0;
          }

          .count {
            color: #666;
            margin-bottom: 15px;
          }

          .table-container {
            width: 100%;
            overflow-x: auto;
            overflow-y: auto;
            max-height: 80vh;

            background: white;

            border-radius: 8px;

            box-shadow:
              0 2px 10px rgba(0, 0, 0, 0.1);
          }

          table {
            border-collapse: collapse;
            width: max-content;
            min-width: 100%;
          }

          th,
          td {
            padding: 10px 14px;

            border: 1px solid #ddd;

            text-align: left;

            white-space: nowrap;

            max-width: 400px;
          }

          th {
            background: #222;
            color: white;

            position: sticky;
            top: 0;

            z-index: 10;

            font-weight: 600;
          }

          tr:nth-child(even) {
            background: #fafafa;
          }

          tr:hover {
            background: #eef3ff;
          }

          td {
            vertical-align: top;
          }

          a {
            color: #1a73e8;
            font-weight: bold;
            text-decoration: none;
          }

          a:hover {
            text-decoration: underline;
          }

          .empty {
            color: #aaa;
          }
        </style>
      </head>

      <body>

        <h1>Registrations</h1>

        <div class="count">
          Total registrations: ${registrations.length}
          &nbsp; | &nbsp;
          Total fields: ${columns.length}
        </div>

        <div class="table-container">

          <table>

            <thead>
              <tr>
                ${columns
                  .map(
                    (column) => `
                      <th>${escapeHtml(column)}</th>
                    `
                  )
                  .join("")}
              </tr>
            </thead>

            <tbody>

              ${
                registrations.length
                  ? tableRows
                  : `
                    <tr>
                      <td colspan="${columns.length}">
                        No registrations found
                      </td>
                    </tr>
                  `
              }

            </tbody>

          </table>

        </div>

      </body>
      </html>
    `);

  } catch (error) {
    console.error("Error fetching registrations:", error);

    res.status(500).send(`
      <h1>Error fetching registrations</h1>
      <pre>${error.message}</pre>
    `);
  }
});

// 🔹 Get an available UPI ID (rotates every 20 completed registrations)
app.get("/upi/available", async (req, res) => {
  try {
    const { registrationsCollection, upiCollection } = await getCollections();

    const upiDocs = await upiCollection.find({}).sort({ _id: 1 }).toArray();
    if (!upiDocs.length) {
      return res.status(404).json({ error: "No UPI IDs configured" });
    }

    const totalRegistrations = await registrationsCollection.countDocuments({});
    const index = Math.floor(totalRegistrations / 20) % upiDocs.length;
    const upi = upiDocs[index];

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
    res.status(500).json({ error: "Error registering group", msg: error });
  }
});

//test

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
