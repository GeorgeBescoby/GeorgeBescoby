# 🚀 Easy Setup Guide for Windows (Non-Technical)

## Step 1: Install Node.js (One-Time Setup)

Node.js is free software that lets you run this application.

1. Go to: https://nodejs.org
2. Click the **big green button** that says "Download Node.js (LTS)"
3. Once downloaded, **double-click** the installer file
4. Click **Next, Next, Next** through the installer (keep all default settings)
5. Click **Finish**

**How to check if it worked:**
- Press `Windows Key + R` on your keyboard
- Type `cmd` and press Enter
- In the black window that appears, type: `node --version`
- You should see something like `v20.11.0` (any version is fine)

---

## Step 2: Download This Project

**Option A: If you have Git installed**
1. Open Command Prompt (search for "cmd" in Windows)
2. Navigate to where you want the project (e.g., `cd Desktop`)
3. Run: `git clone <your-repo-url>`

**Option B: If you don't have Git** (Easier!)
1. Download this project as a ZIP file from GitHub
2. Right-click the ZIP file → **Extract All**
3. Remember where you extracted it (e.g., `C:\Users\YourName\Desktop\GeorgeBescoby`)

---

## Step 3: Run the Application

### Windows Users - Use the Easy Script!

1. **Find the project folder** you just extracted/cloned
2. **Double-click** the file called `START.bat`
3. A black window will open and install everything (this takes 1-2 minutes the first time)
4. Your browser will automatically open to the application!

That's it! The application is now running! 🎉

---

## Step 4: Using the Application

### Get Your OpenAI API Key

1. Go to: https://platform.openai.com/signup
2. Sign up or log in
3. Go to: https://platform.openai.com/api-keys
4. Click **"Create new secret key"**
5. **Copy the key** (it looks like: sk-abc123...)
6. **Important:** Save this key somewhere safe! You can't see it again.

### In the Application

1. Click **"Set API Key"** button at the top
2. Paste your API key
3. Click **"Save Key"**

### Upload Your Data

1. Click **"Choose CSV File"**
2. Select `sample_leads.csv` (included) or your own CSV file
3. Your data appears in the table!

### Enrich Your Data

1. Click one of the **quick templates** (like "SOC2 Compliance")
   - OR type your own question
2. Click **"Enrich All Rows"**
3. Watch the AI fill in the data!
4. Click **"Export CSV"** when done

---

## 🆘 Troubleshooting

### "node is not recognized"
- Node.js isn't installed correctly
- Close ALL windows and try Step 1 again
- Restart your computer after installing

### "Cannot find module"
- The dependencies didn't install
- Open Command Prompt in the project folder
- Type: `npm install`
- Wait for it to finish, then try `START.bat` again

### "Port 3000 is already in use"
- Something else is using that port
- Close the other application or restart your computer

### The browser doesn't open automatically
- Manually open your browser
- Go to: http://localhost:3000

---

## 💾 Stopping the Application

- Close the black Command Prompt window
- Or press `Ctrl + C` in the window

---

## 📞 Need More Help?

If something isn't working:
1. Take a screenshot of any error messages
2. Note which step you're on
3. Check the error message for clues

Common issues are usually:
- Node.js not installed
- Wrong folder opened
- Antivirus blocking the application (temporarily disable it)
