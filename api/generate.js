export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const BRIDE_PHOTO_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_PHOTO_URL = process.env.GROOM_PHOTO_URL;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing Gemini API key" });
  }

  try {
    // Build the contents array with images and text
    const parts = [];

    // Add bride photo (Image 1)
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(BRIDE_PHOTO_URL);
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        const brideBase64 = brideBuffer.toString("base64");
        parts.push({
          text: "Image 1 - This is the BRIDE. Remember her exact face:",
        });
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: brideBase64,
          },
        });
      }
    }

    // Add groom photo (Image 2)
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(GROOM_PHOTO_URL);
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        const groomBase64 = groomBuffer.toString("base64");
        parts.push({
          text: "Image 2 - This is the GROOM. Remember his exact face:",
        });
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: groomBase64,
          },
        });
      }
    }

    // Add guest selfie (Image 3)
    const guestBase64 = guestPhoto.includes(",")
      ? guestPhoto.split(",")[1]
      : guestPhoto;
    parts.push({
      text: "Image 3 - This is the WEDDING GUEST. Remember their exact face:",
    });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: guestBase64,
      },
    });

    // Add the generation prompt
    parts.push({
      text:
        "Now create a beautiful professional wedding photograph of these THREE specific people together. " +
        "CRITICAL INSTRUCTIONS: " +
        "- The BRIDE from Image 1 must appear with her EXACT face, skin tone, hair, and features. Dress her in an elegant white wedding gown. " +
        "- The GROOM from Image 2 must appear with his EXACT face, skin tone, hair, and features. Dress him in a classic black tuxedo. " +
        "- The GUEST from Image 3 must appear with their EXACT face, skin tone, hair, and features. Dress them in formal wedding attire. " +
        "- All three must be IMMEDIATELY RECOGNIZABLE as the people from the reference photos. Do NOT generate new or different faces. " +
        "- They are standing close together, smiling warmly at the camera. " +
        "- Setting: gorgeous outdoor wedding venue, golden hour lighting, lush greenery, elegant floral arrangements, dreamy bokeh background. " +
        "- Style: Professional wedding photography, warm golden tones, natural skin textures, Canon 85mm f/1.4 lens look.",
    });

    // Call Gemini API directly via REST
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: parts,
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            temperature: 1,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      console.error("Gemini error:", JSON.stringify(errData));
      return res.status(502).json({
        error:
          errData?.error?.message || "Image generation failed. Please try again.",
      });
    }

    const data = await geminiRes.json();

    // Find the image part in the response
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      return res.status(502).json({ error: "No response from AI" });
    }

    const responseParts = candidates[0]?.content?.parts || [];
    const imagePart = responseParts.find((p) => p.inlineData);

    if (!imagePart) {
      // Check if there's a text response explaining why
      const textPart = responseParts.find((p) => p.text);
      console.error("No image in response. Text:", textPart?.text);
      return res.status(502).json({
        error: textPart?.text || "No image was generated. Please try again.",
      });
    }

    const imageBase64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    return res.status(200).json({ image: dataUrl });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({
      error: "Something went wrong. Please try again.",
    });
  }
}
