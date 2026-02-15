export const config = { maxDuration: 300 };

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

  // Add Cloudinary resize to keep images under limits
  function resizeUrl(url) {
    if (!url) return url;
    if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_limit,w_1024,h_1024/");
    }
    return url;
  }

  try {
    // Convert guest base64 to a data URI that Replicate accepts
    const guestDataUri = guestPhoto.startsWith("data:")
      ? guestPhoto
      : `data:image/png;base64,${guestPhoto}`;

    // Create prediction with Flux 2 Pro
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux-2-pro",
        input: {
          prompt:
            "Create a fun, vibrant wedding caricature illustration in a premium cartoon style. " +
            "There are exactly THREE people in this image. " +
            "The person from image 1 is the BRIDE — draw her as a stylized caricature keeping her recognizable facial features: her exact hair color, hairstyle, skin tone, face shape, eye shape, and nose from the reference. She is wearing a beautiful white wedding dress. " +
            "The person from image 2 is the GROOM — draw him as a stylized caricature keeping his recognizable facial features: his exact hair color, hairstyle, skin tone, face shape, eye shape, and nose from the reference. He is wearing a sharp black tuxedo with a bow tie. " +
            "The person from image 3 is a WEDDING GUEST — draw them as a stylized caricature keeping their recognizable facial features: their exact hair color, hairstyle, skin tone, face shape, eye shape, and nose from the reference. They are wearing stylish formal attire. " +
            "The bride is on the left, the guest is in the middle, and the groom is on the right. All three are standing close together, smiling and happy. " +
            "The background is a beautiful illustrated scene of the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon with the Mediterranean Sea, in the same stylized cartoon style with warm sunset colors. " +
            "At the TOP of the image, elegant decorative text reads: \"Can't wait to celebrate with you\" in a beautiful script calligraphy font. " +
            "At the BOTTOM, small elegant text reads: \"Hussein & Shahd — May 29, 2026\" " +
            "Style: Premium wedding caricature art, clean lines, vibrant warm colors, playful but elegant, slightly exaggerated proportions with big heads and expressive faces. " +
            "Joyful, celebratory, romantic mood with warm golds, pinks, and sunset oranges.",
          input_image: resizeUrl(BRIDE_PHOTO_URL),
          input_image_2: resizeUrl(GROOM_PHOTO_URL),
          input_image_3: guestDataUri,
          aspect_ratio: "16:9",
          output_format: "png",
          output_quality: 90,
        },
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate create error:", JSON.stringify(errData));

      // If "Prefer: wait" isn't supported, fall back to polling
      if (createRes.status === 400 || createRes.status === 422) {
        return res.status(502).json({
          error: errData?.detail || "Failed to start image generation",
        });
      }
      return res.status(502).json({
        error: errData?.detail || "AI generation failed",
      });
    }

    let prediction = await createRes.json();

    // If the prediction completed immediately (Prefer: wait worked)
    if (prediction.status === "succeeded" && prediction.output) {
      const imageUrl =
        typeof prediction.output === "string"
          ? prediction.output
          : prediction.output[0] || prediction.output;
      return res.status(200).json({ image: imageUrl });
    }

    // Otherwise, poll for completion
    const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const maxWait = 240000; // 4 minutes
    const interval = 3000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, interval));

      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });

      if (!pollRes.ok) {
        console.error("Poll error:", pollRes.status);
        continue;
      }

      prediction = await pollRes.json();

      if (prediction.status === "succeeded") {
        const imageUrl =
          typeof prediction.output === "string"
            ? prediction.output
            : prediction.output[0] || prediction.output;
        return res.status(200).json({ image: imageUrl });
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        console.error("Prediction failed:", prediction.error);
        return res.status(502).json({
          error: prediction.error || "Image generation failed",
        });
      }
    }

    return res.status(504).json({ error: "Image generation timed out. Please try again." });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
