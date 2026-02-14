/*
 * /api/generate.js
 * ────────────────
 * Vercel serverless function that proxies requests to OpenAI.
 * This keeps your API key on the server — never exposed to guests.
 *
 * Environment variables needed (set in Vercel dashboard):
 *   OPENAI_API_KEY    — Your OpenAI API key
 *   BRIDE_PHOTO_URL   — Public URL to bride's photo
 *   GROOM_PHOTO_URL   — Public URL to groom's photo
 */

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body; // base64 data URL from the guest's selfie

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRIDE_PHOTO_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_PHOTO_URL = process.env.GROOM_PHOTO_URL;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured: missing API key" });
  }

  try {
    // ── Convert base64 strings to Blobs for the FormData ──
    function base64ToBlob(dataUrl) {
      const [header, b64] = dataUrl.split(",");
      const mime = header.match(/:(.*?);/)?.[1] || "image/png";
      const bytes = Buffer.from(b64, "base64");
      return new Blob([bytes], { type: mime });
    }

    // Fetch remote image and return as Blob
    async function urlToBlob(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
      return response.blob();
    }

    const prompt =
      "Create a beautiful, joyful professional wedding group photograph. " +
      "There are THREE people in this photo: the bride (from image 1), " +
      "the groom (from image 2), and a wedding guest (from image 3). " +
      "The guest is standing between or beside the bride and groom, all smiling together. " +
      "They are at an elegant wedding venue with soft romantic lighting, lush floral " +
      "arrangements, and a dreamy atmosphere. Make it look like a high-end candid wedding " +
      "photo with warm golden tones. Preserve each person's face and features accurately.";

    // ── Build FormData with all three images ──
    const formData = new FormData();
    formData.append("model", "gpt-image-1");
    formData.append("prompt", prompt);
    formData.append("size", "1536x1024");
    formData.append("quality", "high");

    if (BRIDE_PHOTO_URL) {
      const brideBlob = await urlToBlob(BRIDE_PHOTO_URL);
      formData.append("image[]", brideBlob, "bride.png");
    }

    if (GROOM_PHOTO_URL) {
      const groomBlob = await urlToBlob(GROOM_PHOTO_URL);
      formData.append("image[]", groomBlob, "groom.png");
    }

    const guestBlob = base64ToBlob(guestPhoto);
    formData.append("image[]", guestBlob, "guest.png");

    // ── Call OpenAI ──
    const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json().catch(() => ({}));
      console.error("OpenAI error:", errData);
      return res.status(502).json({
        error: errData?.error?.message || "AI generation failed",
      });
    }

    const data = await openaiRes.json();
    const img = data.data?.[0];

    if (img?.b64_json) {
      return res.status(200).json({ image: `data:image/png;base64,${img.b64_json}` });
    } else if (img?.url) {
      return res.status(200).json({ image: img.url });
    } else {
      return res.status(502).json({ error: "No image returned from AI" });
    }
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
