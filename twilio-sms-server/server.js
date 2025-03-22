require("dotenv").config(); // Load environment variables

const express = require("express");
const cors = require("cors");
const twilio = require("twilio");
const admin = require("firebase-admin");

// Firebase credentials from .env
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
console.log("Firebase initialized successfully!");

// Twilio credentials from .env (using API Key)
const twilioApiKeySid = process.env.TWILIO_API_KEY_SID;
const twilioApiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Validate Twilio credentials
if (!twilioApiKeySid || !twilioApiKeySecret || !twilioAccountSid || !twilioPhone) {
  console.error("Missing Twilio credentials. Please check your environment variables.");
  process.exit(1);
}

// Initialize Twilio client with API Key
const client = twilio(twilioApiKeySid, twilioApiKeySecret, {
  accountSid: twilioAccountSid,
});

const app = express();
const database = admin.database();

// Updated allowed origins to include the deployed frontend
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://web-production-fc86.up.railway.app",
  "https://boot-watcher.vercel.app",
  "https://bootwatcher.com",
  "https://www.bootwatcher.com",
  "https://bootwatcher-local-demo-git-master-aarons-projects-d1bad5c6.vercel.app",
  "https://bootwatcher-local-demo-kahyg9n67-aarons-projects-d1bad5c6.vercel.app",
];

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl) or if the origin is in the allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS error: Origin ${origin} not allowed`);
        callback(new Error(`CORS error: Origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

// Explicitly handle OPTIONS requests
app.options("*", cors());

app.use(express.json());

// Debugging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`Origin: ${req.headers.origin}`);
  console.log(`Headers: ${JSON.stringify(req.headers)}`);
  console.log(`Body: ${JSON.stringify(req.body)}`);
  res.on("finish", () => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Response Headers: ${JSON.stringify(res.getHeaders())}`);
  });
  next();
});

// Routes
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the BootWatcher SMS Backend API!" });
});

app.get("/users", async (req, res) => {
  try {
    const usersRef = database.ref("users");
    const snapshot = await usersRef.once("value");
    const users = snapshot.val();
    res.status(200).json(users || {});
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
});

app.post("/send-sms", async (req, res) => {
  try {
    const { phoneNumbers, message, parkingLot } = req.body;
    console.log("Received /send-sms request:", { phoneNumbers, message, parkingLot });

    // Validate request body
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      console.log("Invalid request: phoneNumbers must be a non-empty array");
      return res.status(400).json({
        success: false,
        error: "Invalid request: phoneNumbers must be a non-empty array",
      });
    }

    if (!message || typeof message !== "string") {
      console.log("Invalid request: message must be a non-empty string");
      return res.status(400).json({
        success: false,
        error: "Invalid request: message must be a non-empty string",
      });
    }

    // Validate phone numbers format (basic validation for E.164 format, e.g., +1234567890)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    const invalidNumbers = phoneNumbers.filter((num) => !phoneRegex.test(num));
    if (invalidNumbers.length > 0) {
      console.log("Invalid phone numbers:", invalidNumbers);
      return res.status(400).json({
        success: false,
        error: "Invalid phone numbers",
        invalidNumbers,
      });
    }

    const results = [];
    for (const phoneNumber of phoneNumbers) {
      try {
        console.log(`Sending SMS to ${phoneNumber}`);
        const messageResult = await client.messages.create({
          body: message,
          from: twilioPhone,
          to: phoneNumber,
        });
        console.log(`Successfully sent SMS to ${phoneNumber}: SID ${messageResult.sid}`);
        results.push({ phoneNumber, sid: messageResult.sid, status: "success" });

        // Optionally log the sent message to Firebase
        const notificationRef = database.ref("notifications").push();
        await notificationRef.set({
          phoneNumber,
          message,
          parkingLot: parkingLot || "Unknown",
          timestamp: admin.database.ServerValue.TIMESTAMP,
        });
      } catch (error) {
        console.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
        results.push({ phoneNumber, error: error.message, status: "failed" });
      }
    }

    // Check if all messages failed
    const allFailed = results.every((result) => result.status === "failed");
    if (allFailed) {
      return res.status(500).json({
        success: false,
        message: "Failed to send SMS to all numbers",
        results,
      });
    }

    res.status(200).json({
      success: true,
      message: "SMS processing completed",
      results,
    });
  } catch (error) {
    console.error("Error in /send-sms endpoint:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to send SMS",
      details: error.message,
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global error:", err.message);
  res.status(500).json({ error: "Something went wrong!", details: err.message });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});