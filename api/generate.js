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
    // Build the input with multiple reference images
    const input = {
      prompt:
        "Create a fun, colorful wedding caricature illustration. " +
        "There are THREE people in this image: " +
        "Reference image 1 is the bride — draw her in a beautiful white wedding dress. " +
        "Reference image 2 is the groom — draw him in a sharp suit or tuxedo. " +
        "Reference image 3 is a wedding guest standing with them. " +
        "Draw all three as playful, exaggerated caricatures with big heads, " +
        "expressive smiling faces, and fun proportions. " +
        "Keep each person's key facial features clearly recognizable " +
        "(hair color, skin tone, face shape, distinctive features) " +
        "but stylized in a whimsical cartoon caricature art style. " +
        "Place them together in a festive wedding scene with flowers, " +
        "confetti, and warm joyful colors. Professional caricature illustration quality.",
      aspect_ratio: "16:9",
      output_format: "png",
      output_quality: 90,
    };

    // Add reference images
    let imageIndex = 1;
    if (BRIDE_PHOTO_URL) {
      input[`input_image_${imageIndex}`] = BRIDE_PHOTO_URL;
      imageIndex++;
    }
    if (GROOM_PHOTO_URL) {
      input[`input_image_${imageIndex}`] = GROOM_PHOTO_URL;
      imageIndex++;
    }
    // Guest selfie as base64 data URL
    input[`input_image_${imageIndex}`] = guestPhoto;

    // Create prediction
const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: input,
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate create error:", JSON.stringify(errData));
      return res.status(502).json({
        error: errData?.detail || "Failed to start image generation",
      });
    }

    let prediction = await createRes.json();

    // If not using "Prefer: wait", poll for completion
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
        }
      );

      if (!pollRes.ok) {
        throw new Error("Failed to check generation status");
      }

      prediction = await pollRes.json();
    }

    if (prediction.status === "failed") {
      console.error("Replicate failed:", prediction.error);
      return res.status(502).json({
        error: prediction.error || "Image generation failed",
      });
    }

    // Flux 2 Pro returns a URL string or array
    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;

    if (!outputUrl) {
      return res.status(502).json({ error: "No image returned" });
    }

    return res.status(200).json({ image: outputUrl });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
