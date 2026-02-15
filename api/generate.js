export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRIDE_PHOTO_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_PHOTO_URL = process.env.GROOM_PHOTO_URL;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing API key" });
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
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const parts = [];

    function addField(name, value) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      );
    }

    function addFile(name, filename, contentType, buffer) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      );
      parts.push(buffer);
      parts.push("\r\n");
    }

    addField("model", "gpt-image-1.5");
    addField(
      "prompt",
      "Create a stunning, joyful wedding portrait photograph of THREE people. " +
        "IMPORTANT: The three people in this photo must have the EXACT faces from the three reference images provided. " +
        "Image 1 is the BRIDE: preserve her exact face, skin tone, hair color, hairstyle, and all facial features precisely. " +
        "She is wearing a gorgeous flowing white wedding dress with elegant lace details. " +
        "Image 2 is the GROOM: preserve his exact face, skin tone, hair color, hairstyle, and all facial features precisely. " +
        "He is wearing a sharp tailored black tuxedo with a white dress shirt and bow tie. " +
        "Image 3 is a WEDDING GUEST: preserve their exact face, skin tone, hair color, hairstyle, and all facial features precisely. " +
        "They are wearing stylish formal wedding guest attire. " +
        "ALL THREE are standing close together on a beautiful terrace overlooking the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon. " +
        "The Mediterranean Sea is a deep gorgeous blue behind them, with the dramatic natural stone arch of Raouche clearly visible. " +
        "Golden hour sunset lighting bathes the scene in warm orange and pink tones. " +
        "They are smiling warmly and naturally at the camera. " +
        "Professional wedding photography quality, shot on Canon EOS R5 with 50mm f/1.4 lens, " +
        "shallow depth of field with the Raouche rock softly blurred in the background. " +
        "Warm golden tones, natural skin textures, cinematic color grading."
    );
    addField("size", "1536x1024");
    addField("quality", "medium");

    // Fetch and attach bride photo
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      }
    }

    // Fetch and attach groom photo
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      }
    }

    // Guest selfie from base64
    const base64Data = guestPhoto.split(",")[1];
    const guestBuffer = Buffer.from(base64Data, "base64");
    addFile("image[]", "guest.png", "image/png", guestBuffer);

    parts.push(`--${boundary}--\r\n`);

    // Combine all parts into a single Buffer
    const bodyParts = parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "utf-8") : p
    );
    const bodyBuffer = Buffer.concat(bodyParts);

    // Call OpenAI
    const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json().catch(() => ({}));
      console.error("OpenAI error:", JSON.stringify(errData));
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
      return res.status(502).json({ error: "No image returned" });
    }
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
