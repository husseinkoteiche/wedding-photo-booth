export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  const BRIDE_PHOTO_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_PHOTO_URL = process.env.GROOM_PHOTO_URL;

  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: "Missing Replicate API token" });
  }

  try {
    // Step 1: Upload the guest selfie to Replicate's file storage
    // (base64 data URIs can be too large for JSON payloads)
    let guestImageUrl = guestPhoto;

    if (guestPhoto.startsWith("data:")) {
      const base64Data = guestPhoto.split(",")[1];
      const imageBuffer = Buffer.from(base64Data, "base64");

      const uploadRes = await fetch("https://api.replicate.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "image/jpeg",
        },
        body: imageBuffer,
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        guestImageUrl = uploadData.urls?.get || guestPhoto;
      }
      // If upload fails, fall back to sending base64 directly
    }

    // Step 2: Build prompt referencing images by number
    const prompt =
      "Create a beautiful professional wedding photograph of exactly three people posing together. " +
      "Use the EXACT faces from the reference images — do not generate new faces. " +
      "Image 1 is the bride: use her exact face and features, dress her in an elegant white wedding gown. " +
      "Image 2 is the groom: use his exact face and features, dress him in a classic black tuxedo. " +
      "Image 3 is a wedding guest: use their exact face and features, dress them in formal wedding attire. " +
      "CRITICAL: Preserve each person's exact facial structure, skin tone, hair color, and distinguishing features. " +
      "They must be immediately recognizable as the people in the reference photos. " +
      "All three are standing close together, smiling warmly at the camera. " +
      "Setting: gorgeous outdoor wedding venue, soft golden hour lighting, " +
      "lush greenery and elegant floral arrangements in the background with dreamy bokeh. " +
      "Professional wedding photography quality, warm golden tones, Canon 85mm f/1.4 lens look.";

    const input = {
      prompt: prompt,
      image_1: BRIDE_PHOTO_URL,
      image_2: GROOM_PHOTO_URL,
      image_3: guestImageUrl,
      aspect_ratio: "16:9",
      output_format: "png",
      output_quality: 90,
    };

    // Step 3: Call Nano Banana Pro on Replicate
    const createRes = await fetch(
      "https://api.replicate.com/v1/models/google/nano-banana-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait=60",
        },
        body: JSON.stringify({ input }),
      }
    );

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate error:", JSON.stringify(errData));

      // If image_1/2/3 params don't work, try alternative format
      if (errData?.detail?.includes("image_1") || errData?.detail?.includes("additional property")) {
        // Try with 'images' array format instead
        const altInput = {
          prompt: prompt,
          images: [BRIDE_PHOTO_URL, GROOM_PHOTO_URL, guestImageUrl].filter(Boolean),
          aspect_ratio: "16:9",
          output_format: "png",
        };

        const altRes = await fetch(
          "https://api.replicate.com/v1/models/google/nano-banana-pro/predictions",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${REPLICATE_API_TOKEN}`,
              "Content-Type": "application/json",
              Prefer: "wait=60",
            },
            body: JSON.stringify({ input: altInput }),
          }
        );

        if (!altRes.ok) {
          const altErr = await altRes.json().catch(() => ({}));
          console.error("Replicate alt error:", JSON.stringify(altErr));
          return res.status(502).json({
            error: altErr?.detail || "Image generation failed. Check Replicate logs.",
          });
        }

        let prediction = await altRes.json();
        return handlePrediction(prediction, REPLICATE_API_TOKEN, res);
      }

      return res.status(502).json({
        error: errData?.detail || errData?.error || "Failed to start generation",
      });
    }

    let prediction = await createRes.json();
    return handlePrediction(prediction, REPLICATE_API_TOKEN, res);
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

async function handlePrediction(prediction, token, res) {
  // Poll if not yet complete
  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled"
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Token ${token}` } }
    );
    if (!pollRes.ok) throw new Error("Failed to check status");
    prediction = await pollRes.json();
  }

  if (prediction.status === "failed") {
    console.error("Replicate failed:", prediction.error);
    return res.status(502).json({
      error: prediction.error || "Image generation failed",
    });
  }

  const output = prediction.output;
  let outputUrl;
  if (Array.isArray(output)) {
    outputUrl = output[0];
  } else if (typeof output === "string") {
    outputUrl = output;
  }

  if (!outputUrl) {
    return res.status(502).json({ error: "No image returned" });
  }

  return res.status(200).json({ image: outputUrl });
}
