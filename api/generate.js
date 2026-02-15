export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;
  const TOKEN = process.env.REPLICATE_API_TOKEN;
  const BRIDE = (process.env.BRIDE_PHOTO_URL || "").trim();
  const GROOM = (process.env.GROOM_PHOTO_URL || "").trim();

  if (!guestPhoto || !BRIDE || !GROOM || !TOKEN) {
    return res.status(400).json({ error: "Missing required images or token" });
  }

  try {
    // Clean guest photo into a proper data URI
    const guestDataUri = guestPhoto.startsWith("data:")
      ? guestPhoto
      : `data:image/png;base64,${guestPhoto.includes(",") ? guestPhoto.split(",")[1] : guestPhoto}`;

    // Call Flux 2 Pro with Prefer: wait (returns result directly)
    const createRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            prompt:
              "A high-end, hyper-realistic wedding photograph. " +
              "SUBJECTS: The woman from index 0 is the bride on the left. " +
              "The man from index 1 is the groom on the right. " +
              "The person from index 2 is the guest in the middle. " +
              "Preserve each person's exact face, skin tone, hair, and features from their reference image. " +
              "SETTING: Terrace overlooking Raouche Rock (Pigeon Rocks), Beirut at golden hour sunset. Mediterranean Sea behind them. " +
              "STYLE: 8K, natural skin textures, Canon EOS R5 85mm f/1.4, cinematic warm lighting. " +
              'TEXT: "Can\'t wait to celebrate with you" at the top. "Hussein & Shahd — May 29, 2026" at the bottom.',
            input_images: [BRIDE, GROOM, guestDataUri],
            aspect_ratio: "16:9",
            mode: "raw",
            guidance: 3.5,
            output_format: "png",
          },
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      console.error("Replicate error:", JSON.stringify(err));
      return res.status(502).json({ error: JSON.stringify(err) });
    }

    const prediction = await createRes.json();

    // Extract image URL from output
    let imageUrl = null;
    if (prediction.output) {
      if (typeof prediction.output === "string") {
        imageUrl = prediction.output;
      } else if (Array.isArray(prediction.output)) {
        imageUrl = prediction.output[0];
      }
    }

    // If Prefer:wait returned but still processing, poll
    if (!imageUrl && prediction.id) {
      const pollUrl = `https://api.replicate.com/v1/predictions/${prediction.id}`;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        if (!pollRes.ok) continue;
        const p = await pollRes.json();

        if (p.status === "succeeded" && p.output) {
          imageUrl = typeof p.output === "string" ? p.output : Array.isArray(p.output) ? p.output[0] : null;
          break;
        }
        if (p.status === "failed" || p.status === "canceled") {
          return res.status(502).json({ error: p.error || "Generation failed" });
        }
      }
    }

    if (!imageUrl) {
      return res.status(502).json({ error: "No image returned" });
    }

    return res.status(200).json({ image: imageUrl });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
