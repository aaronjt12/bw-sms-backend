/**
 * API Server Configuration
 * Handles all backend API routes including Twilio SMS and Firebase operations
 * Uses simplified CORS policies to allow all origins
 */

require("dotenv").config(); // Load environment variables from .env file

// Core Dependencies
const express = require("express");
const twilio = require("twilio");
const admin = require("firebase-admin");

// =============================================
// ERROR HANDLING SETUP
// =============================================

// Global error handlers to catch startup issues
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
  process.exit(1); // Exit on unhandled errors during startup
});

process.on('unhandledRejection', (err) => {
  console.error('🚨 Unhandled Rejection:', err);
  process.exit(1);
});

// =========================
// FIREBASE INITIALIZATION
// =========================

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"), // Handle newlines in key
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Initialize Firebase with error handling
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  console.log("🔥 Firebase initialized successfully");
} catch (error) {
  console.error("❌ Firebase initialization failed:", error);
  process.exit(1);
}
console.log("changes ddone");
// =============================================
// TWILIO INITIALIZATION
// =============================================

const twilioConfig = {
  apiKey: process.env.TWILIO_API_KEY_SID,
  apiSecret: process.env.TWILIO_API_KEY_SECRET,
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
};

// Initialize Twilio client with error handling
let twilioClient;
try {
  twilioClient = twilio(twilioConfig.apiKey, twilioConfig.apiSecret, {
    accountSid: twilioConfig.accountSid,
  });
  console.log("📞 Twilio client initialized successfully");
} catch (error) {
  console.error("❌ Twilio initialization failed:", error);
  process.exit(1);
}

// =============================================
// EXPRESS APP CONFIGURATION
// =============================================

const app = express();
const database = admin.database();

// =============================================
// MIDDLEWARE
// =============================================

// Simple CORS middleware that allows all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Security headers middleware
app.use((req, res, next) => {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'same-origin');
  
  next();
});

// JSON body parser
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`Origin: ${req.headers.origin || 'none'}`);
  console.log(`Headers: ${JSON.stringify(req.headers)}`);
  console.log(`Body: ${JSON.stringify(req.body)}`);
  
  res.on("finish", () => {
    console.log(`↳ Response Status: ${res.statusCode}`);
  });
  
  next();
});

// =============================================
// ROUTES
// =============================================

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all users from Firebase
app.get("/users", async (req, res) => {
  try {
    const usersRef = database.ref("users");
    const snapshot = await usersRef.once("value");
    res.status(200).json(snapshot.val() || {});
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ 
      error: "Failed to fetch users",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Send SMS via Twilio
app.post("/send-sms", async (req, res) => {
  try {
    const { phoneNumbers, message } = req.body;
    
    // Validate request
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || !message) {
      return res.status(400).json({
        error: "Invalid request",
        details: "'phoneNumbers' must be an array and 'message' is required"
      });
    }

    // Process each phone number
    const results = await Promise.all(
      phoneNumbers.map(async (phoneNumber) => {
        try {
          const messageResult = await twilioClient.messages.create({
            body: message,
            from: twilioConfig.phoneNumber,
            to: phoneNumber,
          });
          return { phoneNumber, sid: messageResult.sid, status: "success" };
        } catch (error) {
          return { phoneNumber, error: error.message, status: "failed" };
        }
      })
    );

    res.status(200).json({
      success: true,
      message: "SMS processing completed",
      results
    });
  } catch (error) {
    console.error("Error in /send-sms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send SMS",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =============================================
// ERROR HANDLERS
// =============================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Route not found",
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("💥 Server error:", err.stack);
  
  res.status(500).json({ 
    error: "Internal server error",
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =============================================
// SERVER STARTUP
// =============================================

const PORT = process.env.PORT || process.env.API_PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 API Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Firebase project: ${serviceAccount.project_id}`);
  console.log(`Twilio account: ${twilioConfig.accountSid}\n`);
});