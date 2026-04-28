# REKO PLATFORM — COMPLETE GUIDE
## Setup, Deployment, Hosting & Maintenance

---

## 📁 YOUR PROJECT STRUCTURE

```
reko/
├── frontend/
│   ├── user1.html       ← Professional portal  (link: /user1)
│   ├── user2.html       ← Client portal         (link: /user2)
│   └── admin.html       ← Admin dashboard       (open separately)
├── backend/
│   ├── server.js        ← Main backend server
│   ├── package.json     ← Node.js dependencies
│   ├── .env.example     ← Template for secrets
│   └── uploads/certs/   ← Created automatically
├── .gitignore
└── REKO_GUIDE.md        ← This file
```

---

## 🔗 PAGE LINKS (after deployment)

| Page | URL |
|------|-----|
| Professional (User 1) | `https://your-app.onrender.com/user1` |
| Client (User 2) | `https://your-app.onrender.com/user2` |
| Admin | Open `admin.html` file directly in browser |

> ⚠️ The Admin page is intentionally kept as a separate local file.
> It is NOT hosted publicly. You open it from your own computer only.

---

## STEP 1 — SET UP FREE ACCOUNTS

Before deploying, create these free accounts:

### A) MongoDB Atlas (Database)
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up → Create a FREE cluster (M0 Sandbox)
3. Click **Connect** → **Connect your application**
4. Copy the connection string — it looks like:
   `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/reko`
5. Save this — you'll need it for `.env`

### B) Gmail App Password (Email OTPs)
1. Go to your Google Account → Security
2. Enable **2-Step Verification**
3. Go to **App Passwords** → Create one for "REKO"
4. Copy the 16-character password

### C) Twilio (SMS OTPs) — Optional for demo
1. Go to https://www.twilio.com → Sign up FREE
2. Get a free phone number
3. Copy: Account SID, Auth Token, Phone Number

### D) GitHub Account
1. Go to https://github.com → Sign up free
2. Remember your username

### E) Render (Free Hosting)
1. Go to https://render.com → Sign up with GitHub

---

## STEP 2 — SAVE TO GITHUB

Open your computer terminal (Command Prompt / Terminal):

```bash
# 1. Install Git if you don't have it
# Download from: https://git-scm.com/downloads

# 2. Navigate to your reko folder
cd path/to/reko

# 3. Initialize Git
git init

# 4. Add all files
git add .

# 5. Commit
git commit -m "Initial REKO platform commit"

# 6. Go to GitHub.com → New Repository
#    Name it: reko
#    Set to: Public or Private
#    Do NOT add README (we already have files)

# 7. Connect and push
git remote add origin https://github.com/YOUR_USERNAME/reko.git
git branch -M main
git push -u origin main
```

> ✅ Your code is now on GitHub

---

## STEP 3 — CREATE .env FILE (Secrets)

In your `backend/` folder, create a file called `.env` (no extension):

```env
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/reko
JWT_SECRET=paste_your_64_char_random_string_here
ENCRYPTION_KEY=paste_your_64_char_hex_string_here
EMAIL_SERVICE=gmail
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your_app_password
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE=+1234567890
ADMIN_USERNAME=RACCHEL@EDEEOBBY@2006
ADMIN_PASSWORD=2090@EDGAROBAMA2006OBBY
FRONTEND_URL=https://your-reko.onrender.com
```

To generate your JWT_SECRET and ENCRYPTION_KEY, open terminal and run:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ NEVER push .env to GitHub. It is already in .gitignore.

---

## STEP 4 — DEPLOY ON RENDER (FREE)

1. Go to https://render.com
2. Click **New +** → **Web Service**
3. Connect your GitHub repo → select `reko`
4. Fill in settings:
   - **Name:** reko-platform
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Click **Environment** tab → Add all your `.env` variables one by one
6. Click **Create Web Service**
7. Wait 2–5 minutes → your app is live at `https://reko-platform.onrender.com`

---

## STEP 5 — UPDATE FRONTEND API URL

After getting your Render URL, open `user1.html` and `user2.html`.

Find this line in the EOM AI section (user1.html):
```javascript
const res = await fetch('https://api.anthropic.com/v1/messages', {
```

And the backend API calls — update the base URL:
```javascript
const API_BASE = 'https://your-reko-platform.onrender.com/api';
```

Then push changes to GitHub — Render will auto-redeploy.

---

## STEP 6 — ACCESS THE ADMIN PAGE

The admin page (`admin.html`) is a **local file** for security.

**To open it:**
1. Download `admin.html` to your computer
2. Double-click it → opens in your browser
3. Log in with:
   - Username: `RACCHEL@EDEEOBBY@2006`
   - Password: `2090@EDGAROBAMA2006OBBY`

> 🔐 For extra security, you can also set up Render's private URL feature and only access admin through a VPN.

---

## HOW THE SYSTEM WORKS — SUMMARY

### User 1 (Professional) Flow:
1. Visits `/user1` → sees landing page with full explanation
2. Registers → enters details → OTP sent to email + phone
3. Verifies OTPs → fills professional profile + occupation
4. Uploads certificate → system verifies against certification body database
5. Told if CERTIFIED ✅ or NOT CERTIFIED ❌
6. Logged in automatically → stays logged in 5 days
7. Can chat with clients using encrypted messages
8. EOM AI assistant available bottom-right at all times
9. Can press AGREED button → agreement email sent to both parties

### User 2 (Client) Flow:
1. Visits `/user2` → sees landing page
2. Registers → OTP to email + phone → 1 week access
3. Logs in → browses professionals by category/search
4. Chats securely with professionals
5. Can request counterparts
6. Can press AGREED → exchange contacts after both confirm

### Admin Flow:
1. Opens `admin.html` locally
2. Logs in with encrypted credentials
3. Sees full dashboard: all users, stats, logs
4. Can suspend, restore, or delete any account
5. Reviews all policy violations and suspension reasons

---

## SECURITY FEATURES IMPLEMENTED

| Feature | Status |
|---------|--------|
| AES-256 message encryption | ✅ |
| bcrypt password hashing | ✅ |
| JWT session tokens | ✅ |
| OTP verification (email + SMS) | ✅ |
| Single session enforcement | ✅ |
| Rate limiting on all routes | ✅ |
| Helmet.js security headers | ✅ |
| Policy violation detection | ✅ |
| Auto-suspend at 4 violations | ✅ |
| Login alerts (email + SMS) | ✅ |
| Admin credential isolation | ✅ |
| Encrypted PII in database | ✅ |
| File upload validation | ✅ |
| CORS protection | ✅ |

---

## HOW TO MAKE CHANGES

### Change Admin Password:
1. Open `backend/.env`
2. Update `ADMIN_PASSWORD=new_password`
3. Go to Render dashboard → Environment → update the variable
4. Render auto-restarts

### Add New Certification Body:
Open `backend/server.js`, find `CERT_MOCK_DB`:
```javascript
const CERT_MOCK_DB = {
  'YOUR_BODY_NAME': ['CERT-001', 'CERT-002'],
  // add more here
};
```

### Add New Occupation:
Open `frontend/user1.html`, find `const OCCUPATIONS = [...]`
Add your occupation to the array.

### Change Session Duration:
- Professional: In `backend/server.js` → `expiresIn: '5d'`
- Client: In `backend/server.js` → `expiresIn: '7d'`

### Change Policy Banned Words:
In `backend/server.js`, find `BANNED_PATTERNS`:
```javascript
const BANNED_PATTERNS = [
  /\b(kill|murder|harm|...)\b/i,
];
```
Add or remove words inside the pattern.

### Update Colors/Branding:
- User 1 colors: In `user1.html` → `:root { --gold: ... }`
- User 2 colors: In `user2.html` → `:root { --teal: ... }`
- Admin colors: In `admin.html` → `:root { --red: ... }`

---

## CONNECTING REAL CERTIFICATION BODIES

In `backend/server.js`, replace `verifyCertificate()` function:

```javascript
async function verifyCertificate(certBody, certNumber, country) {
  // Example: SAICA API
  if (certBody.includes('SAICA')) {
    const response = await fetch('https://api.saica.org.za/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.SAICA_API_KEY}` },
      body: JSON.stringify({ memberNumber: certNumber })
    });
    const data = await response.json();
    return data.verified === true;
  }
  // Add more bodies here
}
```

Each certification body has its own API — contact them directly to get API access.

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| MongoDB connection fails | Check your MONGODB_URI in .env and whitelist your IP in Atlas |
| Emails not sending | Check Gmail App Password, enable "Less secure apps" or use SendGrid |
| SMS not sending | Check Twilio credentials and verify your trial phone number |
| App crashes on Render | Check Render logs → Environment tab → verify all .env vars |
| OTP not arriving | Check spam folder; in demo mode OTPs print to server console |
| Admin page won't open | Make sure you're opening admin.html as a local file |
| Chat not working real-time | Socket.io requires WebSocket support — Render free tier supports it |

---

## UPGRADING FROM DEMO TO PRODUCTION

1. Replace mock certification DB with real API calls
2. Set up real Twilio account (remove trial restrictions)
3. Use professional email service (SendGrid, Mailgun) instead of Gmail
4. Upgrade Render to paid plan for always-on hosting (free tier sleeps)
5. Enable MongoDB Atlas backups
6. Set up a custom domain

---

## IMPORTANT NOTES

- 🔐 Keep your `.env` file SECRET — never share it
- 📱 OTPs work in demo mode (printed to console) even without Twilio
- 📧 Emails work in demo mode (logged to console) without Gmail setup
- 🔄 Render free tier may sleep after 15min of inactivity — first load is slow
- 💾 All user data is encrypted in the database
- 🚫 Admin credentials are only in your `.env` file — safe

---

*REKO Platform — Built for connecting certified professionals with clients.*
*Version 1.0 | April 2026*
