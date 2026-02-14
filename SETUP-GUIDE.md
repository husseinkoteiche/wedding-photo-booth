# Wedding Photo Booth — Complete Setup Guide

Everything you need to go from these project files to a working QR code at your wedding.

---

## What You're Building

Guests scan a QR code → their phone opens a camera → they take a selfie → AI creates a wedding portrait of them with you and your partner → they save or share it.

---

## Prerequisites

You need these three accounts (all free to create):

| Account | URL | What For |
|---------|-----|----------|
| **GitHub** | https://github.com/signup | Stores your code |
| **Vercel** | https://vercel.com/signup | Hosts your website for free |
| **OpenAI** | https://platform.openai.com/signup | AI image generation |

You also need **Node.js** installed on your computer. Download it from https://nodejs.org (pick the LTS version). To check if you already have it, open Terminal (Mac) or Command Prompt (Windows) and type `node --version`.

---

## Step 1: Get Your OpenAI API Key (10 min)

1. Go to https://platform.openai.com and sign in
2. Click your profile icon (top right) → **API keys**
3. Click **Create new secret key**, give it a name like "wedding-booth"
4. **Copy the key immediately** — you won't be able to see it again. It looks like `sk-proj-abc123...`
5. Go to **Settings → Billing** and add a payment method
6. Add **$10–20 in credits** to start (each photo costs roughly $0.05–0.10)

> **Save your API key somewhere safe** — you'll need it in Step 5.

---

## Step 2: Prepare Your Photos (10 min)

You need one clear photo of the bride and one of the groom. Ideally:
- **Head & shoulders** or waist-up shots
- **Well-lit**, facing the camera
- **Simple background** (the AI will replace it anyway)

### Upload them to a free image host:

**Option A — Imgur (easiest)**
1. Go to https://imgur.com and click **New Post**
2. Upload the bride's photo
3. Right-click the image → **Copy image address** — save this URL
4. Repeat for the groom's photo

**Option B — Cloudinary (more reliable)**
1. Go to https://cloudinary.com and create a free account
2. Go to **Media Library** → upload both photos
3. Click each photo → copy the **URL**

You'll end up with two URLs like:
```
https://i.imgur.com/abc123.jpg    (bride)
https://i.imgur.com/xyz789.jpg    (groom)
```

> **Save both URLs** — you'll need them in Step 5.

---

## Step 3: Personalize the Code (5 min)

Open the file `src/App.js` and find these two lines near the top:

```js
const COUPLE_NAMES = "Sarah & James";
const WEDDING_DATE = "February 14, 2026";
```

Change them to your actual names and date. **That's the only code you need to edit.**

---

## Step 4: Push to GitHub (10 min)

### If you've never used GitHub before:

1. Install Git: https://git-scm.com/downloads
2. Open Terminal / Command Prompt
3. Navigate to the project folder:
   ```bash
   cd path/to/wedding-booth-project
   ```
4. Run these commands one by one:
   ```bash
   git init
   git add .
   git commit -m "Wedding photo booth"
   ```
5. Go to https://github.com/new
6. Name the repository `wedding-photo-booth` and click **Create repository**
7. Copy the two commands GitHub shows you under "push an existing repository" and run them. They look like:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/wedding-photo-booth.git
   git branch -M main
   git push -u origin main
   ```

### If you're familiar with GitHub:

Just create a new repo, push the project folder, done.

---

## Step 5: Deploy to Vercel (10 min)

1. Go to https://vercel.com and sign in with your GitHub account
2. Click **Add New → Project**
3. Find `wedding-photo-booth` in the list and click **Import**
4. **Before clicking Deploy**, expand **Environment Variables** and add these three:

   | Variable Name | Value |
   |---------------|-------|
   | `OPENAI_API_KEY` | `sk-proj-abc123...` (your key from Step 1) |
   | `BRIDE_PHOTO_URL` | `https://i.imgur.com/abc123.jpg` (your URL from Step 2) |
   | `GROOM_PHOTO_URL` | `https://i.imgur.com/xyz789.jpg` (your URL from Step 2) |

5. Click **Deploy**
6. Wait 1–2 minutes. Vercel will give you a URL like:
   ```
   https://wedding-photo-booth-abc123.vercel.app
   ```

7. **Open that URL on your phone** and test it! Take a selfie and make sure the AI generates a photo.

---

## Step 6: (Optional) Add a Custom Domain (5 min)

Instead of the long Vercel URL, you can use something like `photos.sarahandjames.com`:

1. In Vercel, go to your project → **Settings → Domains**
2. Type your domain and click **Add**
3. Vercel will show DNS records — add them at your domain registrar (GoDaddy, Namecheap, etc.)
4. Wait 5–15 minutes for DNS to update

> If you don't already own a domain, the Vercel URL works perfectly fine.

---

## Step 7: Generate the QR Code (5 min)

1. Go to https://www.qr-code-generator.com (or any QR code site)
2. Paste your live URL (e.g., `https://wedding-photo-booth-abc123.vercel.app`)
3. Download the QR code as a high-resolution PNG

> **Tip:** Test the QR code with your phone's camera to make sure it works before printing.

---

## Step 8: Print & Display at the Wedding (time varies)

Some ideas:

### Table Cards
Print small cards (4×6 or 5×7) with:
- The QR code
- Text like: *"Take a photo with Sarah & James! Scan to try our AI photo booth"*
- Place one at each table

### Standing Sign
Print a larger poster (8×10 or 11×17) with:
- The QR code (big enough to scan from a few feet away)
- Your names and a fun message
- Frame it and place it near the entrance, bar, or photo area

### Screen Display
If you have a projector or TV at the reception:
- Display the QR code on screen during cocktail hour or dancing

---

## Troubleshooting

### "Camera not working"
- The site must be HTTPS (Vercel handles this automatically)
- Guests need to tap "Allow" when the browser asks for camera permission
- Some older browsers on Android may not support this — Chrome works best

### "Photo generation failed"
- Check that your OpenAI account has credits (Settings → Billing on platform.openai.com)
- Check that environment variables are correct in Vercel (Project → Settings → Environment Variables)
- Check Vercel function logs: Project → Deployments → latest → Functions tab

### "Photos don't look good"
- Try better source photos of the bride & groom (clear, well-lit, facing camera)
- You can tweak the AI prompt in `api/generate.js` — look for the `prompt` variable
- Experiment before the wedding to find the best prompt wording

### "QR code doesn't work"
- Make sure you're copying the full URL including `https://`
- Test by typing the URL directly in your phone browser first

---

## Cost Estimate

Each AI-generated photo costs roughly **$0.05–0.10** with OpenAI.

| Wedding Size | Estimated Photos | Estimated Cost |
|-------------|-----------------|----------------|
| 50 guests | ~75 photos | $4–8 |
| 100 guests | ~150 photos | $8–15 |
| 200 guests | ~300 photos | $15–30 |

Hosting on Vercel is **free** for this level of traffic.

> **Tip:** Load $20 in OpenAI credits and you'll be well covered for even a large wedding.

---

## Quick Reference: File Structure

```
wedding-booth-project/
├── api/
│   └── generate.js        ← Backend proxy (holds your API key securely)
├── public/
│   └── index.html          ← HTML shell
├── src/
│   ├── index.js            ← React entry point
│   └── App.js              ← The photo booth app (edit names/date here)
├── package.json            ← Dependencies
├── vercel.json             ← Vercel config
└── .gitignore
```

**Files you edit:**
- `src/App.js` → Couple names and wedding date (line 11–12)
- Everything else is configured in Vercel's environment variables

---

## Summary Checklist

- [ ] Created OpenAI account and got API key
- [ ] Added $10–20 credits to OpenAI
- [ ] Uploaded bride & groom photos and got URLs
- [ ] Edited couple names and date in `src/App.js`
- [ ] Pushed code to GitHub
- [ ] Deployed to Vercel with environment variables
- [ ] Tested on phone — camera works, AI generates photo
- [ ] Generated QR code
- [ ] Printed cards or sign for the wedding
- [ ] Tested QR code from printed material

🎉 **You're done!**
