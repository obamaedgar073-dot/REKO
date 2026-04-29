// ============================================================
// REKO BACKEND SERVER - Node.js + Express
// Full-stack backend for the REKO professional platform
// ============================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }
});

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com"],
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts.' }
});
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ============================================================
// DATABASE CONNECTION
// ============================================================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/reko', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ============================================================
// ENCRYPTION HELPERS
// ============================================================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) { return text; }
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================================
// DATABASE SCHEMAS
// ============================================================

// Professional (User 1)
const ProfessionalSchema = new mongoose.Schema({
  fname: { type: String, required: true },
  lname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  emailEncrypted: String,
  phone: String,
  phoneEncrypted: String,
  password: { type: String, required: true }, // bcrypt hashed
  country: String,
  occupation: String,
  experience: String,
  bio: String,
  skills: [String],
  languages: String,
  availability: String,
  certBody: String,
  certNumber: String,
  certFileUrl: String,
  certified: { type: Boolean, default: false },
  certVerifiedAt: Date,
  status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'pending' },
  policyViolations: { type: Number, default: 0 },
  violationResetAt: Date,
  suspensionReason: String,
  suspendedAt: Date,
  sessionToken: String,
  sessionDeviceId: String,
  sessionStart: Date,
  lastLogin: Date,
  loginAlertSent: Boolean,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Client (User 2)
const ClientSchema = new mongoose.Schema({
  accountType: { type: String, enum: ['individual', 'company'], default: 'individual' },
  fname: String,
  lname: String,
  companyName: String,
  companyRegNumber: String,
  contactPerson: String,
  email: { type: String, required: true, unique: true },
  emailEncrypted: String,
  phone: String,
  phoneEncrypted: String,
  password: { type: String, required: true },
  country: String,
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  policyViolations: { type: Number, default: 0 },
  violationResetAt: Date,
  suspensionReason: String,
  suspendedAt: Date,
  sessionToken: String,
  sessionDeviceId: String,
  sessionStart: Date,
  weekExpiry: Date, // 1 week access
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now }
});

// OTP Store
const OTPSchema = new mongoose.Schema({
  userId: String,
  userType: String,
  emailOTP: String,
  phoneOTP: String,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, // 10 min
  verified: { type: Boolean, default: false }
});

// Chat Message
const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  senderId: String,
  senderType: String,
  contentEncrypted: String, // AES encrypted
  timestamp: { type: Date, default: Date.now },
  policyViolation: { type: Boolean, default: false },
  agreed: { type: Boolean, default: false }
});

// Agreement
const AgreementSchema = new mongoose.Schema({
  professionalId: String,
  clientId: String,
  status: { type: String, enum: ['pending', 'professional_agreed', 'client_agreed', 'both_agreed'], default: 'pending' },
  professionalAgreedAt: Date,
  clientAgreedAt: Date,
  emailSentAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// System Log
const LogSchema = new mongoose.Schema({
  action: String,
  userId: String,
  userType: String,
  details: String,
  severity: { type: String, enum: ['info', 'warn', 'error', 'success'], default: 'info' },
  ip: String,
  timestamp: { type: Date, default: Date.now }
});

const Professional = mongoose.model('Professional', ProfessionalSchema);
const Client = mongoose.model('Client', ClientSchema);
const OTPStore = mongoose.model('OTPStore', OTPSchema);
const Message = mongoose.model('Message', MessageSchema);
const Agreement = mongoose.model('Agreement', AgreementSchema);
const Log = mongoose.model('Log', LogSchema);

// ============================================================
// EMAIL & SMS SETUP
// ============================================================
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function sendEmail(to, subject, html) {
  try {
    if (!process.env.EMAIL_USER) {
      console.log(`📧 [DEMO] Email to ${to}: ${subject}`);
      return true;
    }
    await emailTransporter.sendMail({ from: `REKO <${process.env.EMAIL_USER}>`, to, subject, html });
    return true;
  } catch (e) {
    console.error('Email error:', e.message);
    return false;
  }
}

async function sendSMS(to, message) {
  try {
    if (!twilioClient) {
      console.log(`📱 [DEMO] SMS to ${to}: ${message}`);
      return true;
    }
    await twilioClient.messages.create({ body: message, from: process.env.TWILIO_PHONE, to });
    return true;
  } catch (e) {
    console.error('SMS error:', e.message);
    return false;
  }
}

// ============================================================
// POLICY CHECKER
// ============================================================
const BANNED_PATTERNS = [
  /\b(kill|murder|harm|hurt|rape|bomb|explosive|drug|cocaine|heroin|porn|nude|naked|sex|xxx|hack|malware|virus|terrorist)\b/i,
  /\b(phone|whatsapp|telegram|instagram|email|contact|number|address)\b/i // block contact sharing before agreement
];

function checkPolicyViolation(message) {
  return BANNED_PATTERNS[0].test(message);
}

function checkContactSharing(message) {
  return BANNED_PATTERNS[1].test(message);
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authMiddleware(userType) {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token provided' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'reko_secret_key_change_in_production');
      if (decoded.type !== userType) return res.status(403).json({ error: 'Unauthorized' });
      req.userId = decoded.id;
      req.userType = userType;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'reko_secret_key_change_in_production');
    if (decoded.type !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function logAction(action, userId, userType, details, severity = 'info', ip = '') {
  try {
    await Log.create({ action, userId, userType, details, severity, ip });
  } catch (e) {}
}

// ============================================================
// FILE UPLOAD (Certificates)
// ============================================================
const storage = multer.diskStorage({
  destination: './uploads/certs/',
  filename: (req, file, cb) => {
    cb(null, `cert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, JPG, PNG allowed.'));
  }
});

// ============================================================
// CERTIFICATION BODY MOCK DATABASE
// In production: integrate real APIs from SAICA, HPCSA, ECSA etc.
// ============================================================
const CERT_MOCK_DB = {
  'SAICA': ['SAICA-2024-001234', 'SAICA-2023-005678', 'SAICA-2022-009012'],
  'HPCSA': ['HPCSA-MP-001', 'HPCSA-DP-002', 'HPCSA-PS-003'],
  'ECSA': ['ECSA-2024-CE001', 'ECSA-2024-EE002', 'ECSA-2023-ME003'],
  'SACE': ['SACE-2024-T001', 'SACE-2023-T002'],
  'Law Society': ['LAW-2024-ADV001', 'LAW-2023-ATT002'],
  'SANC': ['SANC-RN-001', 'SANC-EN-002'],
  'PMI': ['PMI-PMP-001', 'PMI-CAPM-002'],
  'BCS': ['BCS-2024-001', 'BCS-2023-002'],
};

function verifyCertificate(certBody, certNumber) {
  // In production: make API calls to actual certification body databases
  const bodyKey = Object.keys(CERT_MOCK_DB).find(k => certBody.includes(k));
  if (!bodyKey) return false;
  return CERT_MOCK_DB[bodyKey].includes(certNumber);
}

// ============================================================
// ROUTES: PROFESSIONAL (USER 1)
// ============================================================

// Step 1: Initial registration - send OTPs
app.post('/api/pro/register/init', async (req, res) => {
  try {
    const { fname, lname, email, phone, password, country } = req.body;
    if (!fname || !lname || !email || !phone || !password || !country)
      return res.status(400).json({ error: 'All fields are required.' });

    const exists = await Professional.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered.' });

    const emailOTP = generateOTP();
    const phoneOTP = generateOTP();
    const tempId = 'TEMP_' + Date.now();

    await OTPStore.deleteMany({ userId: email });
    await OTPStore.create({ userId: email, userType: 'professional', emailOTP, phoneOTP });

    await sendEmail(email, 'REKO — Your Verification Code', `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#0A0A0F;color:#E8E8F0;border-radius:12px;">
        <h2 style="color:#C9A84C;">REKO Professional Portal</h2>
        <p>Your email verification code is:</p>
        <div style="font-size:2rem;font-weight:900;color:#C9A84C;letter-spacing:8px;padding:20px;background:rgba(201,168,76,0.1);border-radius:8px;text-align:center;">${emailOTP}</div>
        <p style="color:#9090A8;font-size:0.85rem;">This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    `);

    await sendSMS(phone, `REKO: Your phone verification code is ${phoneOTP}. Expires in 10 minutes.`);
    await logAction('OTP_SENT', email, 'professional', `OTPs sent to ${email} and ${phone}`, 'info', req.ip);

    res.json({ success: true, message: 'OTPs sent to email and phone.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// Step 2: Verify OTPs
app.post('/api/pro/register/verify-otp', async (req, res) => {
  try {
    const { email, emailOTP, phoneOTP } = req.body;
    const otpRecord = await OTPStore.findOne({ userId: email, userType: 'professional' });
    if (!otpRecord) return res.status(400).json({ error: 'OTP not found. Please start registration again.' });
    if (otpRecord.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    if (otpRecord.emailOTP !== emailOTP || otpRecord.phoneOTP !== phoneOTP)
      return res.status(400).json({ error: 'Incorrect OTP(s). Please try again.' });

    await OTPStore.updateOne({ userId: email }, { verified: true });
    res.json({ success: true, message: 'OTPs verified successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Step 3+4: Complete registration with profession + certificate
app.post('/api/pro/register/complete', upload.single('certFile'), async (req, res) => {
  try {
    const { fname, lname, email, phone, password, country, occupation, experience, bio, skills, languages, availability, certBody, certNumber } = req.body;

    const otpRecord = await OTPStore.findOne({ userId: email, verified: true });
    if (!otpRecord) return res.status(400).json({ error: 'OTP not verified. Please complete verification first.' });

    const exists = await Professional.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered.' });

    // Verify certificate
    const certified = verifyCertificate(certBody, certNumber);

    const hashedPassword = await bcrypt.hash(password, 12);
    const emailEncrypted = encrypt(email);
    const phoneEncrypted = encrypt(phone || '');

    const pro = await Professional.create({
      fname, lname, email, emailEncrypted, phone, phoneEncrypted,
      password: hashedPassword, country, occupation,
      experience, bio, skills: skills ? JSON.parse(skills) : [],
      languages, availability, certBody, certNumber,
      certFileUrl: req.file ? req.file.filename : null,
      certified, certVerifiedAt: certified ? new Date() : null,
      status: 'active', sessionStart: new Date()
    });

    const token = jwt.sign({ id: pro._id, type: 'professional' }, process.env.JWT_SECRET || 'reko_secret_key_change_in_production', { expiresIn: '5d' });

    const certMsg = certified
      ? `✅ Congratulations! Your certificate from ${certBody} has been VERIFIED. You are now a certified professional on REKO.`
      : `⚠️ Your certificate from ${certBody} could not be verified at this time. You may still use the platform, but your profile will show as unverified.`;

    await sendEmail(email, 'REKO — Registration ' + (certified ? 'Successful & Certified' : 'Successful'), `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#0A0A0F;color:#E8E8F0;border-radius:12px;">
        <h2 style="color:#C9A84C;">Welcome to REKO, ${fname}!</h2>
        <p>${certMsg}</p>
        <p style="color:#9090A8;">Your account is active. You will remain logged in for 5 days.</p>
      </div>
    `);

    await logAction('REGISTER', pro._id.toString(), 'professional', `New professional registered: ${fname} ${lname} (${certified ? 'CERTIFIED' : 'UNCERTIFIED'})`, 'success', req.ip);
    await OTPStore.deleteMany({ userId: email });

    res.json({ success: true, token, certified, message: certMsg, user: { fname, lname, occupation, certified, country } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Professional login
app.post('/api/pro/login', async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const pro = await Professional.findOne({ email });
    if (!pro) return res.status(401).json({ error: 'No account found with this email.' });

    const valid = await bcrypt.compare(password, pro.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password.' });

    if (pro.status === 'suspended') return res.status(403).json({ error: 'Your account is suspended. Please contact admin.' });

    // Single session enforcement - terminate old session
    if (pro.sessionToken && pro.sessionDeviceId !== deviceId) {
      // Old device session is invalidated (new token overwrites)
      await logAction('SESSION_OVERRIDE', pro._id.toString(), 'professional', `New device login. Old session terminated.`, 'warn', req.ip);
    }

    const token = jwt.sign({ id: pro._id, type: 'professional' }, process.env.JWT_SECRET || 'reko_secret_key_change_in_production', { expiresIn: '5d' });
    await Professional.updateOne({ _id: pro._id }, { sessionToken: token, sessionDeviceId: deviceId || 'unknown', sessionStart: new Date(), lastLogin: new Date() });

    // Login alert
    await sendEmail(email, 'REKO — New Login Alert', `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#0A0A0F;color:#E8E8F0;border-radius:12px;">
        <h2 style="color:#C9A84C;">New Login Detected</h2>
        <p>A new login to your REKO Professional account was detected.</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p style="color:#FF5252;">If this was not you, contact support immediately.</p>
      </div>
    `);
    await sendSMS(pro.phone, `REKO: New login to your account at ${new Date().toLocaleTimeString()}. Not you? Contact support.`);
    await logAction('LOGIN', pro._id.toString(), 'professional', `Login from ${req.ip}`, 'info', req.ip);

    res.json({ success: true, token, user: { fname: pro.fname, lname: pro.lname, occupation: pro.occupation, certified: pro.certified, country: pro.country } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Get professional profile
app.get('/api/pro/profile', authMiddleware('professional'), async (req, res) => {
  try {
    const pro = await Professional.findById(req.userId).select('-password -sessionToken -emailEncrypted -phoneEncrypted -certFileUrl');
    if (!pro) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ success: true, profile: pro });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ============================================================
// ROUTES: CLIENT (USER 2)
// ============================================================

app.post('/api/client/register/init', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) return res.status(400).json({ error: 'Email and phone required.' });

    const exists = await Client.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered.' });

    const emailOTP = generateOTP();
    const phoneOTP = generateOTP();
    await OTPStore.deleteMany({ userId: email });
    await OTPStore.create({ userId: email, userType: 'client', emailOTP, phoneOTP });

    await sendEmail(email, 'REKO — Client Verification Code', `
      <div style="font-family:sans-serif;max-width:500px;padding:30px;background:#050D15;color:#EEF4FF;border-radius:12px;">
        <h2 style="color:#00B4D8;">REKO Client Portal</h2>
        <p>Your verification code is:</p>
        <div style="font-size:2rem;font-weight:900;color:#00B4D8;letter-spacing:8px;padding:20px;background:rgba(0,180,216,0.1);border-radius:8px;text-align:center;">${emailOTP}</div>
        <p style="color:#8BA7C4;font-size:0.85rem;">Expires in 10 minutes.</p>
      </div>
    `);
    await sendSMS(phone, `REKO: Your verification code is ${phoneOTP}. Expires in 10 minutes.`);

    res.json({ success: true, message: 'OTPs sent.' });
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/client/register/verify-otp', async (req, res) => {
  try {
    const { email, emailOTP, phoneOTP } = req.body;
    const record = await OTPStore.findOne({ userId: email, userType: 'client' });
    if (!record || record.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired or not found.' });
    if (record.emailOTP !== emailOTP || record.phoneOTP !== phoneOTP) return res.status(400).json({ error: 'Incorrect OTPs.' });
    await OTPStore.updateOne({ userId: email }, { verified: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error.' });
  }
});

app.post('/api/client/register/complete', async (req, res) => {
  try {
    const { accountType, fname, lname, companyName, companyRegNumber, contactPerson, email, phone, password, country } = req.body;
    const otpRecord = await OTPStore.findOne({ userId: email, verified: true });
    if (!otpRecord) return res.status(400).json({ error: 'OTP not verified.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const weekExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const client = await Client.create({
      accountType, fname, lname, companyName, companyRegNumber, contactPerson,
      email, emailEncrypted: encrypt(email),
      phone, phoneEncrypted: encrypt(phone || ''),
      password: hashedPassword, country, weekExpiry, sessionStart: new Date()
    });

    await OTPStore.deleteMany({ userId: email });
    await logAction('REGISTER', client._id.toString(), 'client', `New client: ${accountType === 'company' ? companyName : fname + ' ' + lname}`, 'success', req.ip);
    res.json({ success: true, message: 'Registration successful.' });
  } catch (e) {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/client/login', async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const client = await Client.findOne({ email });
    if (!client) return res.status(401).json({ error: 'No account found.' });
    if (!await bcrypt.compare(password, client.password)) return res.status(401).json({ error: 'Incorrect password.' });
    if (client.status === 'suspended') return res.status(403).json({ error: 'Account suspended.' });
    if (client.weekExpiry < new Date()) return res.status(403).json({ error: 'Your 1-week access has expired. Please re-register.' });

    if (client.sessionToken && client.sessionDeviceId !== deviceId) {
      await logAction('SESSION_OVERRIDE', client._id.toString(), 'client', 'New device login. Old session terminated.', 'warn', req.ip);
    }

    const token = jwt.sign({ id: client._id, type: 'client' }, process.env.JWT_SECRET || 'reko_secret_key_change_in_production', { expiresIn: '7d' });
    await Client.updateOne({ _id: client._id }, { sessionToken: token, sessionDeviceId: deviceId || 'unknown', sessionStart: new Date(), lastLogin: new Date() });

    await sendEmail(email, 'REKO — Login Alert', `<p>New login detected on your REKO Client account at ${new Date().toLocaleString()}. If this wasn't you, contact support.</p>`);
    await sendSMS(client.phone, `REKO: New login at ${new Date().toLocaleTimeString()}. Not you? Contact support.`);
    await logAction('LOGIN', client._id.toString(), 'client', `Login from ${req.ip}`, 'info', req.ip);

    const displayName = client.accountType === 'company' ? client.companyName : client.fname;
    res.json({ success: true, token, user: { displayName, accountType: client.accountType, country: client.country } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Get professionals list (for clients)
app.get('/api/professionals', authMiddleware('client'), async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = { status: 'active' };
    if (category) query.occupation = { $regex: category, $options: 'i' };
    if (search) query.$or = [
      { occupation: { $regex: search, $options: 'i' } },
      { skills: { $elemMatch: { $regex: search, $options: 'i' } } }
    ];
    // Only return non-sensitive fields
    const pros = await Professional.find(query).select('fname lname occupation certified certBody skills bio availability country createdAt');
    res.json({ success: true, professionals: pros });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load professionals.' });
  }
});

// ============================================================
// ROUTES: MESSAGING
// ============================================================

app.post('/api/messages/send', async (req, res) => {
  try {
    const { conversationId, senderId, senderType, content } = req.body;
    if (!content || !conversationId) return res.status(400).json({ error: 'Missing fields.' });

    // Policy check
    if (checkPolicyViolation(content)) {
      // Record violation
      if (senderType === 'professional') {
        const pro = await Professional.findById(senderId);
        if (pro) {
          let violations = pro.policyViolations + 1;
          let update = { policyViolations: violations };
          if (violations >= 4) {
            update.status = 'suspended';
            update.suspensionReason = 'Repeated policy violations in chat';
            update.suspendedAt = new Date();
            await logAction('SUSPENSION', senderId, 'professional', 'Suspended: 4+ policy violations', 'error', '');
            await sendEmail(pro.email, 'REKO — Account Suspended', '<p>Your account has been suspended due to repeated policy violations. An admin will review your case.</p>');
          }
          await Professional.updateOne({ _id: senderId }, update);
        }
      } else if (senderType === 'client') {
        const client = await Client.findById(senderId);
        if (client) {
          let violations = client.policyViolations + 1;
          let update = { policyViolations: violations };
          if (violations >= 4) {
            update.status = 'suspended';
            update.suspensionReason = 'Repeated policy violations';
            update.suspendedAt = new Date();
            await Client.updateOne({ _id: senderId }, update);
          }
          await Client.updateOne({ _id: senderId }, update);
        }
      }
      await logAction('POLICY_VIOLATION', senderId, senderType, `Blocked message: "${content.substr(0, 50)}"`, 'warn', '');
      return res.status(400).json({ error: 'Message blocked: Policy violation.', violations: true });
    }

    // Encrypt and store message
    const contentEncrypted = encrypt(content);
    const msg = await Message.create({ conversationId, senderId, senderType, contentEncrypted });

    // Emit via socket
    io.to(conversationId).emit('new_message', {
      id: msg._id,
      senderType,
      content,
      timestamp: msg.timestamp
    });

    res.json({ success: true, messageId: msg._id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

app.get('/api/messages/:conversationId', async (req, res) => {
  try {
    const msgs = await Message.find({ conversationId: req.params.conversationId }).sort({ timestamp: 1 }).limit(100);
    const decrypted = msgs.map(m => ({
      id: m._id,
      senderType: m.senderType,
      content: decrypt(m.contentEncrypted),
      timestamp: m.timestamp
    }));
    res.json({ success: true, messages: decrypted });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

// ============================================================
// ROUTES: AGREEMENT
// ============================================================

app.post('/api/agreement/press', async (req, res) => {
  try {
    const { professionalId, clientId, pressingParty } = req.body;
    let agreement = await Agreement.findOne({ professionalId, clientId });

    if (!agreement) {
      agreement = await Agreement.create({ professionalId, clientId });
    }

    let update = {};
    if (pressingParty === 'professional') update = { professionalAgreedAt: new Date(), status: 'professional_agreed' };
    else if (pressingParty === 'client') update = { clientAgreedAt: new Date(), status: 'client_agreed' };

    // Check if both have agreed
    const updatedAgreement = await Agreement.findOneAndUpdate({ professionalId, clientId }, update, { new: true });
    if (updatedAgreement.professionalAgreedAt && updatedAgreement.clientAgreedAt) {
      await Agreement.updateOne({ professionalId, clientId }, { status: 'both_agreed', emailSentAt: new Date() });

      const pro = await Professional.findById(professionalId).select('email fname');
      const client = await Client.findById(clientId).select('email fname companyName accountType');
      const clientName = client?.accountType === 'company' ? client.companyName : client?.fname;

      const agreementEmailHtml = `
        <div style="font-family:sans-serif;padding:30px;background:#0A0A0F;color:#E8E8F0;border-radius:12px;">
          <h2 style="color:#00E676;">🤝 Agreement Confirmed!</h2>
          <p>Both parties have confirmed agreement on REKO.</p>
          <p>You may now exchange contact details securely through the platform chat.</p>
          <p style="color:#9090A8;font-size:0.85rem;">Remember: Platform policies still apply during contact sharing.</p>
        </div>`;
      if (pro) await sendEmail(pro.email, 'REKO — Agreement Confirmed', agreementEmailHtml);
      if (client) await sendEmail(client.email, 'REKO — Agreement Confirmed', agreementEmailHtml);
      await logAction('AGREEMENT', professionalId, 'professional', `Agreement between pro ${professionalId} and client ${clientId}`, 'success', '');
    }

    res.json({ success: true, bothAgreed: updatedAgreement.status === 'both_agreed' });
  } catch (e) {
    res.status(500).json({ error: 'Agreement failed.' });
  }
});

// ============================================================
// ROUTES: ADMIN
// ============================================================

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'RACCHEL@EDEEOBBY@2006';
    const adminPass = process.env.ADMIN_PASSWORD || '2090@EDGAROBAMA2006OBBY';
    if (username !== adminUser || password !== adminPass) {
      await logAction('ADMIN_LOGIN_FAIL', 'admin', 'admin', `Failed admin login attempt from ${req.ip}`, 'error', req.ip);
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
    const token = jwt.sign({ id: 'admin', type: 'admin' }, process.env.JWT_SECRET || 'reko_secret_key_change_in_production', { expiresIn: '8h' });
    await logAction('ADMIN_LOGIN', 'admin', 'admin', `Admin logged in from ${req.ip}`, 'info', req.ip);
    res.json({ success: true, token });
  } catch (e) {
    res.status(500).json({ error: 'Admin login failed.' });
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [pros, clients, suspended, agreements, logs] = await Promise.all([
      Professional.countDocuments(),
      Client.countDocuments(),
      Professional.countDocuments({ status: 'suspended' }) + await Client.countDocuments({ status: 'suspended' }),
      Agreement.countDocuments({ status: 'both_agreed' }),
      Log.find().sort({ timestamp: -1 }).limit(50)
    ]);
    res.json({ success: true, stats: { pros, clients, suspended, agreements }, logs });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

app.get('/api/admin/professionals', adminAuth, async (req, res) => {
  try {
    const pros = await Professional.find().select('-password -sessionToken');
    const decrypted = pros.map(p => ({
      ...p.toObject(),
      email: p.emailEncrypted ? decrypt(p.emailEncrypted) : p.email,
      phone: p.phoneEncrypted ? decrypt(p.phoneEncrypted) : p.phone
    }));
    res.json({ success: true, professionals: decrypted });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load professionals.' });
  }
});

app.get('/api/admin/clients', adminAuth, async (req, res) => {
  try {
    const clients = await Client.find().select('-password -sessionToken');
    const decrypted = clients.map(c => ({
      ...c.toObject(),
      email: c.emailEncrypted ? decrypt(c.emailEncrypted) : c.email,
      phone: c.phoneEncrypted ? decrypt(c.phoneEncrypted) : c.phone
    }));
    res.json({ success: true, clients: decrypted });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load clients.' });
  }
});

app.post('/api/admin/suspend', adminAuth, async (req, res) => {
  try {
    const { userId, userType, reason } = req.body;
    if (userType === 'professional') await Professional.updateOne({ _id: userId }, { status: 'suspended', suspensionReason: reason, suspendedAt: new Date() });
    else await Client.updateOne({ _id: userId }, { status: 'suspended', suspensionReason: reason, suspendedAt: new Date() });
    await logAction('ADMIN_SUSPEND', userId, userType, `Admin suspended: ${reason}`, 'warn', req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Suspension failed.' });
  }
});

app.post('/api/admin/restore', adminAuth, async (req, res) => {
  try {
    const { userId, userType } = req.body;
    if (userType === 'professional') await Professional.updateOne({ _id: userId }, { status: 'active', suspensionReason: null, policyViolations: 0 });
    else await Client.updateOne({ _id: userId }, { status: 'active', suspensionReason: null, policyViolations: 0 });
    await logAction('ADMIN_RESTORE', userId, userType, 'Account restored by admin', 'success', req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Restore failed.' });
  }
});

app.delete('/api/admin/delete/:userType/:userId', adminAuth, async (req, res) => {
  try {
    const { userType, userId } = req.params;
    if (userType === 'professional') await Professional.deleteOne({ _id: userId });
    else await Client.deleteOne({ _id: userId });
    await logAction('ADMIN_DELETE', userId, userType, 'Account permanently deleted', 'error', req.ip);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed.' });
  }
});

app.get('/api/admin/logs', adminAuth, async (req, res) => {
  try {
    const logs = await Log.find().sort({ timestamp: -1 }).limit(200);
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load logs.' });
  }
});

// ============================================================
// SOCKET.IO — Real-time encrypted chat
// ============================================================
const connectedUsers = {};

io.on('connection', (socket) => {
  socket.on('join_conversation', ({ conversationId, userId, userType }) => {
    socket.join(conversationId);
    connectedUsers[socket.id] = { conversationId, userId, userType };
  });

  socket.on('disconnect', () => {
    delete connectedUsers[socket.id];
  });
});

// ============================================================
// STATIC FILES
// ============================================================
app.use('/user1', express.static(path.join(__dirname, '../fronted'), { index: 'user1.html' }));
app.use('/user2', express.static(path.join(__dirname, '../frontend'), { index: 'user2.html' }));
app.use('/uploads', express.static(path.join(__dirname, './uploads')));

// Default
app.get('/', (req, res) => res.redirect('/user1'));

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 REKO Server running on port ${PORT}`);
  console.log(`   User 1 (Professional): http://localhost:${PORT}/user1`);
  console.log(`   User 2 (Client):       http://localhost:${PORT}/user2`);
  console.log(`   Admin:                 Open admin.html directly from DB link\n`);
});

module.exports = app;
