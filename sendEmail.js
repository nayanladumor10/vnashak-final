const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

const [,, email, licenseKey] = process.argv;

if (!email || !licenseKey) {
  console.error("Usage: node sendEmail.js <email> <licenseKey>");
  process.exit(1);
}

const htmlContent = `
  <h2 style="color: #2563eb;">V-Nashak Security - License Key</h2>
  <p>Thank you for choosing V-Nashak Security!</p>
  <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p><strong>Your License Key:</strong></p>
    <p style="font-size: 24px; font-weight: bold;">${licenseKey}</p>
  </div>
  <p>This key is tied to your email and machine.</p>
`;

async function sendMail() {
  try {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const msg = {
        to: email,
        from: process.env.SENDGRID_FROM || process.env.EMAIL_USER,
        subject: "Your V-Nashak License Key 🔐",
        html: htmlContent,
      };

      await sgMail.send(msg);
      console.log("✅ Email sent via Twilio SendGrid");
    } else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      await transporter.sendMail({
        from: `"V-Nashak Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your V-Nashak License Key 🔐",
        html: htmlContent,
      });

      console.log("✅ Email sent via Gmail (Nodemailer)");
    } else {
      console.error("❌ No email provider configured. Please set SENDGRID_API_KEY or EMAIL_USER/EMAIL_PASS in .env");
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to send email:", error.response?.body || error);
    process.exit(1);
  }
}

sendMail();
