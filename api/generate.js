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

    // Create prediction with Flux 2 Max (official model endpoint)
    const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-2-max/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt:
            "A stunning photorealistic wedding portrait photograph of the three people provided in the reference images. " +
            "The bride from image 1 is on the left — preserve her exact face, skin tone, hair color, hairstyle, and all facial features. She is wearing a gorgeous flowing white wedding dress with elegant lace details. " +
            "The groom from image 2 is on the right — preserve his exact face, skin tone, hair color, hairstyle, and all facial features. He is wearing a sharp tailored black tuxedo with a white dress shirt and bow tie. " +
            "The wedding guest from image 3 is in the middle — preserve their exact face, skin tone, hair color, hairstyle, and all facial features. They are wearing stylish formal wedding attire. " +
            "All three standing close together, smiling warmly and naturally at the camera. " +
            "They are on a beautiful terrace overlooking the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon. The Mediterranean Sea is deep blue behind them with the dramatic natural stone arch clearly visible. " +
            "Golden hour sunset lighting with warm orange and pink tones. " +
            "At the top of the image, elegant text reads: \"Can't wait to celebrate with you\" in a beautiful script calligraphy font. " +
            "At the bottom, small elegant text reads: \"Hussein & Shahd — May 29, 2026\" " +
            "Professional wedding photography, Canon EOS R5, 85mm f/1.4 lens, shallow depth of field, natural skin textures, cinematic warm color grading. Hyper-realistic photography.",
          input_images: [
            resizeUrl(BRIDE_PHOTO_URL),
            resizeUrl(GROOM_PHOTO_URL),
            guestDataUri,
          ],
          aspect_ratio: "16:9",
          output_format: "png",
          output_quality: 90,
          mode: "raw",
          guidance: 3.5,
        },
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate create error:", JSON.stringify(errData));
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
