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
    const input = {
      prompt:
        "Create a professional high-quality wedding photograph of three people together. " +
        "CRITICAL: Use the EXACT faces from the reference images — do not generate new faces. " +
        "The person from input_image is the bride wearing an elegant white wedding gown. " +
        "The person from input_image_2 is the groom wearing a classic black tuxedo. " +
        "The person from input_image_3 is a wedding guest in formal attire. " +
        "All three people must have their exact real faces, skin tones, facial structures, " +
        "hair colors, and distinguishing features preserved with photographic accuracy. " +
        "They are standing close together, smiling naturally at the camera. " +
        "Beautiful outdoor wedding venue, soft golden hour sunlight, " +
        "blurred green garden background with bokeh, floral arrangements. " +
        "Professional wedding photography, Canon 85mm f/1.4, warm tones, natural skin.",
      aspect_ratio: "16:9",
      output_format: "png",
      output_quality: 90,
    };

    // Flux 2 Pro uses: input_image, input_image_2, input_image_3, etc.
    if (BRIDE_PHOTO_URL) {
      input.input_image = BRIDE_PHOTO_URL;
    }
    if (GROOM_PHOTO_URL) {
      input.input_image_2 = GROOM_PHOTO_URL;
    }
    input.input_image_3 = guestPhoto;

    const createRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
      }
    );

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate error:", JSON.stringify(errData));
      return res.status(502).json({
        error: errData?.detail || "Failed to start image generation",
      });
    }

    let prediction = await createRes.json();

    // Poll if not yet complete
    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled"
    ) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` } }
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
