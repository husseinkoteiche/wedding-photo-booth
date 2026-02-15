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

  function resizeUrl(url) {
    if (!url) return url;
    if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_limit,w_1024,h_1024/");
    }
    return url;
  }

  try {
    console.log("Generating caricature...");

    const prompt =
      "A professional, high-end digital wedding caricature with EXACT identity matching. " +
      "SCENE COMPOSITION: A panoramic 16:9 trio portrait. " +
      "1. THE BRIDE (Referencing Image 0): Positioned on the left. Use the exact facial geometry, eye shape, and smile from Image 0. Hair must be styled exactly as in the reference but rendered in a clean digital paint style. She wears a premium white lace wedding dress. " +
      "2. THE GROOM (Referencing Image 1): Positioned on the right. Transfer the exact jawline, nose shape, and grooming from Image 1. He wears a sharp, tailored black tuxedo with a satin bow tie. " +
      "3. THE GUEST (Referencing Image 2): Positioned in the center. This is a 1:1 identity lock. Preserve the guest's specific eye-folds, unique nose structure, and hairstyle from Image 2. Do not generalize; maintain their specific ethnicity and facial character. " +
      "ARTISTIC STYLE: 'Elegant Digital Caricature.' Use clean vector-like lines, smooth shading, and professional color grading. Exaggerate only the head-to-body ratio (60/40), but KEEP facial features anatomically consistent with the references. No generic cartoon faces. " +
      "ENVIRONMENT: Iconic Raouche Rock in Beirut. The sea must show realistic sunset reflections. Golden hour lighting (5500K) illuminating the subjects' faces from the side. " +
      "TEXT RENDERING: At the top, 'Can't wait to celebrate with you' in a high-contrast white calligraphy script. At the bottom, 'Hussein & Shahd — May 29, 2026' in a minimalist serif font. " +
      "TECHNICAL: 8k resolution, deep depth of field, vibrant saturation, high-fidelity detail preservation.";

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

    addField("model", "gpt-image-1");
    addField("prompt", prompt);
    addField("size", "1536x1024");
    addField("quality", "medium");

    // Image 0: Bride
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      }
    }

    // Image 1: Groom
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      }
    }

    // Image 2: Guest
    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const guestBuffer = Buffer.from(base64Data, "base64");
    addFile("image[]", "guest.png", "image/png", guestBuffer);

    parts.push(`--${boundary}--\r\n`);

    const bodyParts = parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "utf-8") : p
    );
    const bodyBuffer = Buffer.concat(bodyParts);

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
      console.error("OpenAI image error:", JSON.stringify(errData));
      return res.status(502).json({
        error: errData?.error?.message || "AI generation failed",
      });
    }

    const data = await openaiRes.json();
    const img = data.data?.[0];

    if (img?.b64_json) {
      return res
        .status(200)
        .json({ image: `data:image/png;base64,${img.b64_json}` });
    } else if (img?.url) {
      return res.status(200).json({ image: img.url });
    } else {
      return res.status(502).json({ error: "No image returned" });
    }
  } catch (err) {
    console.error("Generate error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
}
