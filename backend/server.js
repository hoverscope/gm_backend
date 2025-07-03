const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..')));

// Serve index.html at root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

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
      ? 'Thank you for pre-registering!'
      : 'Thank you for contacting us!';

    const message = type === 'preregister'
      ? `Hi ${fullName},\n\nThank you for pre-registering!`
      : `Hi ${fullName},\n\nThank you for your message!`;

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
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'Full name and email are required' });
    }

    const saved = await saveToFile('preregistrations.json', { fullName, email });

    try {
      await withTimeout(sendConfirmationEmail(email, fullName, 'preregister'));
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
    if (!fullName || !email || !title || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const saved = await saveToFile('contacts.json', { fullName, email, title, message });

    try {
      await sendConfirmationEmail(email, fullName, 'contact');
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