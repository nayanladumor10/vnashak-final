const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");
const License = require("./models/License");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());

// --- MongoDB Connection ---
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));
} else {
  console.log("📝 MongoDB not configured, using file-based storage");
}

// --- User ID logic ---
let usedUserIds = new Set();
const USED_IDS_FILE = path.join(__dirname, "used-user-ids.json");

let validUserIds = new Set();
const VALID_IDS_FILE = path.join(__dirname, "user_ids.json");

function loadValidUserIds() {
  if (fs.existsSync(VALID_IDS_FILE)) {
    const data = fs.readFileSync(VALID_IDS_FILE, "utf8");
    validUserIds = new Set(JSON.parse(data));
    console.log(`✅ Loaded ${validUserIds.size} valid User IDs`);
  } else {
    fs.writeFileSync(VALID_IDS_FILE, "[]", "utf8");
  }
}

function isUserIdValid(userId) { return validUserIds.has(userId); }
function isUserIdAlreadyUsed(userId) { return usedUserIds.has(userId); }
function markUserIdAsUsed(userId) {
  usedUserIds.add(userId);
  fs.writeFileSync(USED_IDS_FILE, JSON.stringify(Array.from(usedUserIds), null, 2));
}

// --- Scanner path ---
const scannerExe = process.platform === "win32" ? "scanner.exe" : "scanner";
const scannerPath = path.join(__dirname, "..", scannerExe);
console.log(`🔍 Scanner path: ${scannerPath}`);
console.log(`🔍 Scanner exists: ${fs.existsSync(scannerPath)}`);

// --- License key generator ---
async function generateUniqueLicenseKey() {
  const segment = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  let key;
  do {
    key = `${segment()}-${segment()}-${segment()}`;
  } while (await License.findOne({ licenseKey: key }));
  return key;
}

// --- API Endpoints ---

// Status
app.get("/", (req, res) => {
  res.json({
    status: "SUCCESS",
    message: "V-Nashak License Server is running",
    emailConfigured: !!(process.env.SENDGRID_API_KEY || (process.env.EMAIL_USER && process.env.EMAIL_PASS)),
  });
});

// Test userId
app.post("/test-userid", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ status: "ERROR", message: "userId is required" });

  if (!isUserIdValid(userId)) return res.json({ status: "ERROR", message: "Invalid User ID" });
  if (isUserIdAlreadyUsed(userId)) return res.json({ status: "ERROR", message: "User ID already used" });

  res.json({ status: "SUCCESS", message: "User ID is valid and unused" });
});

// Send license
app.post("/send-license", async (req, res) => {
  const { email, userId, name, phoneNumber } = req.body;
  if (!email || !userId || !name || !phoneNumber) return res.status(400).json({ status:"ERROR", message:"All fields required" });

  if (!isUserIdValid(userId)) return res.status(400).json({ status:"ERROR", message:"Invalid User ID" });
  if (isUserIdAlreadyUsed(userId)) return res.status(400).json({ status:"ERROR", message:"User ID already used" });

  try {
    const licenseKey = await generateUniqueLicenseKey();
    const newLicense = new License({ email, userId, name, phoneNumber, licenseKey, status: "ASSIGNED" });
    await newLicense.save();

    const htmlContent = `
      <h2 style="color: #2563eb;">V-Nashak Security - License Key</h2>
      <p>Hello ${name},</p>
      <div style="background: #f1f5f9; padding:16px; border-radius:8px; margin:16px 0;">
        <p><strong>Your License Key:</strong></p>
        <p style="font-size:24px; font-weight:bold;">${licenseKey}</p>
      </div>
      <p>Tied to your email & machine.</p>
    `;

    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({ to: email, from: process.env.SENDGRID_FROM || process.env.EMAIL_USER, subject: "Your V-Nashak License Key 🔐", html: htmlContent });
      console.log(`✅ Email sent via SendGrid to ${email}`);
    } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({ from: `"V-Nashak Security" <${process.env.EMAIL_USER}>`, to: email, subject: "Your V-Nashak License Key 🔐", html: htmlContent });
      console.log(`✅ Email sent via Gmail to ${email}`);
    }

    markUserIdAsUsed(userId);
    res.json({ status:"SUCCESS", message:"User ID validated and license sent!", licenseKey });

  } catch (err) {
    console.error("❌ Error sending license:", err.response?.body || err);
    res.status(500).json({ status:"ERROR", message:"Internal server error" });
  }
});

// Activate license
app.post("/activate-license", async (req, res) => {
  console.log(`🔐 /activate-license endpoint called`);
  const { email, licenseKey, machineId } = req.body;

  if (!email || !licenseKey || !machineId) {
    return res.status(400).json({
      status: "ERROR",
      message: "Email, licenseKey, and machineId are required.",
    });
  }

  console.log(`🔐 Activating license: Email=${email}, Key=${licenseKey}, MachineId=${machineId}`);

  try {
    // 1. Find the license by its key ONLY.
    const storedLicense = await License.findOne({ licenseKey: licenseKey });

    if (!storedLicense) {
      return res.status(404).json({ status: "ERROR", message: "Invalid license key." });
    }

    // 2. Verify the email matches the one associated with the key.
    if (storedLicense.email !== email) {
      return res.status(403).json({ status: "ERROR", message: "This license key is not valid for this email address." });
    }

    // 3. Check if the license is already activated.
    if (storedLicense.status === "ACTIVATED") {
      // If it's for the same machine, it's a valid re-activation.
      if (storedLicense.machineId === machineId) {
        console.log(`✅ License already active for ${email} on ${machineId}`);
        return res.json({
          status: "ALREADY_ACTIVATED",
          message: "This license is already active on this device.",
        });
      } else {
        // If it's for a different machine, block the activation.
        return res.status(409).json({
          status: "ERROR",
          message: "This license key is already activated on a different machine.",
        });
      }
    }

    // 4. If all checks pass, activate the license.
    storedLicense.machineId = machineId;
    storedLicense.status = "ACTIVATED";
    storedLicense.activatedAt = new Date();

    await storedLicense.save();

    console.log(`✅ License ${licenseKey} activated for ${email} on ${machineId}`);
    res.json({ status: "VALID", message: "License activated successfully." });

  } catch (dbError) {
    console.error("❌ Database error during activation:", dbError);
    res.status(500).json({ status: "ERROR", message: "A database error occurred during activation." });
  }
});

// --- Error & 404 handling ---
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({ status: "ERROR", message: "Internal server error" });
});

app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ status: "ERROR", message: `Route not found: ${req.method} ${req.url}` });
});

// --- Start server ---
app.listen(PORT, () => {
  if (fs.existsSync(USED_IDS_FILE)) {
    const data = fs.readFileSync(USED_IDS_FILE, "utf8");
    usedUserIds = data ? new Set(JSON.parse(data)) : new Set();
    console.log(`✅ Loaded ${usedUserIds.size} used User IDs`);
  }
  loadValidUserIds();
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
