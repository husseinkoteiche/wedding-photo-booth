import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const BRIDE_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_URL = process.env.GROOM_PHOTO_URL;

  if (!BRIDE_URL || !GROOM_URL) {
    return res.status(500).json({ error: "Missing bride or groom photo URL" });
  }

  try {
    // Ensure the guest photo is a clean Data URI
    const guestDataUri = guestPhoto.startsWith("data:")
      ? guestPhoto
      : `data:image/png;base64,${guestPhoto}`;

    // Run Flux 2 Max — the SDK handles polling automatically
    const output = await replicate.run("black-forest-labs/flux-2-max", {
      input: {
        prompt:
          "A hyper-realistic 8K professional wedding photograph. " +
          "The woman from image 0 is the BRIDE standing on the left — preserve her exact face, skin tone, hair, and all facial features. She is wearing a gorgeous white wedding dress. " +
          "The man from image 1 is the GROOM standing on the right — preserve his exact face, skin tone, hair, and all facial features. He is wearing a sharp black tuxedo with a bow tie. " +
          "The person from image 2 is a WEDDING GUEST standing in the middle — preserve their exact face, skin tone, hair, and all facial features. They are wearing stylish formal attire. " +
          "All three are standing close together, smiling warmly at the camera. " +
          "They are on a terrace overlooking the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon. Mediterranean Sea behind them, golden hour sunset. " +
          "At the top, elegant script text: \"Can't wait to celebrate with you\" " +
          "At the bottom, small text: \"Hussein & Shahd — May 29, 2026\" " +
          "Natural skin textures, real hair strands, professional Canon EOS R5 85mm f/1.4 photography. Photorealistic, not illustration.",
        input_images: [
          BRIDE_URL.trim(),
          GROOM_URL.trim(),
          guestDataUri,
        ],
        aspect_ratio: "16:9",
        mode: "raw",
        guidance: 3.5,
      },
    });

    // Output is usually a URL string or array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (!imageUrl) {
      return res.status(502).json({ error: "No image returned" });
    }

    return res.status(200).json({ image: imageUrl });
  } catch (err) {
    console.error("Replicate Error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong. Please try again." });
  }
}
