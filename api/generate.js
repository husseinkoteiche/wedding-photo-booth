OPEN AI Code that Works
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
      "Create a fun, vibrant wedding caricature illustration in a premium cartoon style. " +
        "There are exactly THREE people in this image: " +
        "Image 1 is the BRIDE — draw her as a stylized caricature but KEEP her recognizable facial features: her exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. She is wearing a beautiful white wedding dress. " +
        "Image 2 is the GROOM — draw him as a stylized caricature but KEEP his recognizable facial features: his exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. He is wearing a sharp black tuxedo with a bow tie. " +
        "Image 3 is a WEDDING GUEST — draw them as a stylized caricature but KEEP their recognizable facial features: their exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. They are wearing stylish formal attire. " +
        "The bride is on the left, the guest is in the middle, and the groom is on the right. All three are standing close together, smiling and happy. " +
        "The background is a beautiful illustrated scene of the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon with the Mediterranean Sea, drawn in the same stylized cartoon style with warm sunset colors. " +
        "At the TOP of the image, there is elegant decorative text that reads: \"Can't wait to celebrate with you\" in a beautiful script/calligraphy font. " +
        "At the BOTTOM of the image, small elegant text reads: \"Hussein & Shahd — May 29, 2026\" " +
        "Style: Premium wedding caricature art, clean lines, vibrant warm colors, playful but elegant, slightly exaggerated proportions with big heads and expressive faces. " +
        "The overall mood should be joyful, celebratory, and romantic with a warm color palette of golds, pinks, and sunset oranges."
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
