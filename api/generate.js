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

    // Call Flux 2 Pro with Prefer: wait
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
              "A premium wedding caricature illustration of three people. " +
              "STYLE: High-quality digital caricature art with slightly exaggerated proportions — big heads, expressive eyes, warm smiles. Clean vector-like lines, vibrant colors, playful but elegant. NOT a cartoon, NOT chibi — a sophisticated caricature like those drawn by professional wedding caricature artists. " +
              "IDENTITY: The woman from index 0 is the BRIDE on the left — preserve her EXACT face shape, skin tone, hair color, hairstyle, eye color, nose shape, and distinguishing features from the reference. She is wearing a beautiful flowing white wedding dress with lace details. " +
              "The man from index 1 is the GROOM on the right — preserve his EXACT face shape, skin tone, hair color, hairstyle, eye color, nose shape, and distinguishing features from the reference. He is wearing a sharp black tuxedo with a white shirt and bow tie. " +
              "The person from index 2 is a WEDDING GUEST in the middle — preserve their EXACT face shape, skin tone, hair color, hairstyle, eye color, nose shape, and distinguishing features from the reference. They are wearing stylish formal wedding attire. " +
              "All three standing close together, happy and smiling warmly. " +
              "BACKGROUND: A beautiful illustrated version of Raouche Rock (Pigeon Rocks) in Beirut, Lebanon with the Mediterranean Sea, painted in the same caricature style with warm sunset colors — golden, orange, pink sky. " +
              'TEXT: At the top in elegant decorative script font: "Can\'t wait to celebrate with you" ' +
              'At the bottom in smaller elegant text: "Hussein & Shahd — May 29, 2026" ' +
              "COLOR PALETTE: Warm golds, sunset oranges, soft pinks, romantic tones. The overall mood is joyful, celebratory, and romantic.",
            input_images: [BRIDE, GROOM, guestDataUri],
            aspect_ratio: "16:9",
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
