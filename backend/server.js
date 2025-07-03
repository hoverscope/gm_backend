const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 6200;

app.use(cors());
app.use(express.json());

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

// Setup transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timed out')), ms))
  ]);
}

async function saveToFile(filename, data) {
  const filePath = path.join(dataDir, filename);
  let existingData = [];
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    existingData = JSON.parse(fileContent);
  } catch (e) {
    // file might not exist yet
  }
  const newEntry = { id: Date.now().toString(), timestamp: new Date().toISOString(), ...data };
  existingData.push(newEntry);
  await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
  return newEntry;
}

async function sendConfirmationEmail(email, fullName, type) {
  try {
    const subject = type === 'preregister'
      ? 'GreenMiles | Pre-Registration Confirmation'
      : 'GreenMiles | We Have Received Your Message';

    const message = type === 'preregister'
      ? `Dear ${fullName},\n\nThank you for expressing your interest in GreenMiles, your pre-registration has been received successfully.\n\nWe'll keep you informed with the latest updates and let you know as soon as we launch.\n\nWarm regards,\nHexTech`
      : `Dear ${fullName},\n\nThank you for contacting GreenMiles. We have received your message and will get back to you within 1–2 business days.\n\nBest regards,\nHexTech`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: message
    };

    console.log("Sending email to:", email);
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);

    return info;
  } catch (err) {
    console.error("❌ sendConfirmationEmail crashed:", err);
    throw err;
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

app.post('/api/preregister', async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const fName = fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    if (!fName || !email) {
      return res.status(400).json({ success: false, message: 'Full name and email are required' });
    }

    const saved = await saveToFile('preregistrations.json', { fName, email });

    try {
      await withTimeout(sendConfirmationEmail(email, fName, 'preregister'));
    } catch (emailErr) {
      console.error('Failed to send preregister confirmation email:', emailErr);
      // Still return success because data saved
      return res.json({
        success: true,
        message: "Pre-registration saved but failed to send confirmation email.",
        id: saved.id,
        emailError: true,
      });
    }

    res.json({
      success: true,
      message: 'Thank you for pre-registering! Confirmation email sent.',
      id: saved.id,
    });
  } catch (err) {
    console.error('Preregister endpoint error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { fullName, email, title, message } = req.body;
    const fName = fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    if (!fName || !email || !title || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const saved = await saveToFile('contacts.json', { fName, email, title, message });

    try {
      await sendConfirmationEmail(email, fName, 'contact');
    } catch (emailErr) {
      console.error('Failed to send contact confirmation email:', emailErr);
      return res.json({
        success: true,
        message: 'Message saved but failed to send confirmation email.',
        id: saved.id,
        emailError: true,
      });
    }

    res.json({
      success: true,
      message: 'Thank you for your message! Confirmation email sent.',
      id: saved.id,
    });
  } catch (err) {
    console.error('Contact endpoint error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});