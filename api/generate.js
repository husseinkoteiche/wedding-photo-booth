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

  // NEW: Put the “closest” image (the one you shared) on Cloudinary and set this env var.
  // It acts as a STYLE reference only.
  const STYLE_REF_URL = process.env.STYLE_REF_URL;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing API key" });
  }

  // Prefer face-crops for identity (huge improvement if your refs include background)
  function faceCropUrl(url) {
    if (!url) return url;
    if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
      // g_face = focus on detected face
      // c_thumb = tight crop
      // w/h 1024 = enough detail for identity
      return url.replace("/upload/", "/upload/c_thumb,g_face,w_1024,h_1024/");
    }
    return url;
  }

  // For the style reference we don't need face crop; just cap it
  function styleResizeUrl(url) {
    if (!url) return url;
    if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_limit,w_1536,h_1024/");
    }
    return url;
  }

  try {
    console.log("Generating image...");

    // Key change: NO @image0 tokens. We bind via ORDER of uploaded images.
    // Also: Remove text overlay from generation to protect face fidelity.
    const prompt =
      "You are provided FOUR reference images via image[] uploads IN THIS EXACT ORDER:\n" +
      "1) BRIDE face reference\n" +
      "2) GROOM face reference\n" +
      "3) GUEST face reference\n" +
      "4) STYLE reference image (match its illustration style + composition)\n\n" +

      "GOAL: Generate ONE wedding photobooth caricature illustration in the SAME style as the style reference (image #4), but with MORE accurate likeness to the bride, groom, and guest.\n\n" +

      "ABSOLUTE RULES:\n" +
      "- EXACTLY three people only. No extra people, no crowd, no silhouettes, no reflections with people.\n" +
      "- Preserve each person's identity from their reference images (1–3). They must be instantly recognizable.\n" +
      "- Do not merge faces, do not swap faces, do not average faces.\n" +
      "- Do not beautify/idealize or change ethnicity.\n\n" +

      "COMPOSITION (match the style reference):\n" +
      "- Bride on LEFT, Guest in CENTER, Groom on RIGHT\n" +
      "- Close photobooth framing (upper body / shoulders), faces large in frame\n" +
      "- Warm sunset coastal lighting, painterly-polished caricature look\n\n" +

      "EXPRESSIONS (must be consistent):\n" +
      "- Bride: big cheerful smile, joyful\n" +
      "- Groom: big cheerful smile, happy and confident\n" +
      "- Guest: friendly natural smile\n\n" +

      "OUTFITS:\n" +
      "- Bride: white wedding dress\n" +
      "- Groom: black tuxedo, white shirt, black bow tie\n" +
      "- Guest: formal wedding attire (neutral)\n\n" +

      "SETTING:\n" +
      "Raouche Rock terrace, Beirut. Mediterranean Sea background. Warm sunset atmosphere.\n" +
      "Keep background similar in vibe to style reference; faces are the priority.\n\n" +

      "CARICATURE LIMITS (to protect likeness):\n" +
      "- Caricature ONLY through slightly larger heads relative to bodies and slightly amplified smiles.\n" +
      "- Do NOT alter facial geometry (eye spacing, nose shape, jawline, lip shape). Preserve asymmetry.\n\n" +

      "NEGATIVE:\n" +
      "extra people, crowd, silhouettes, reflections with people, merged faces, swapped faces, generic faces,\n" +
      "beautified faces, plastic skin, anime, pixar, heavy distortion, deformed anatomy, extra limbs/fingers,\n" +
      "changing eye spacing, changing nose shape, changing jawline.";

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
    addField("quality", "high");

    // Upload in the exact order described in the prompt:

    // 1) Bride (FACE CROP)
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(faceCropUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride-face.jpg", "image/jpeg", brideBuffer);
      } else {
        console.warn("Bride photo fetch failed:", brideRes.status);
      }
    } else {
      console.warn("Missing BRIDE_PHOTO_URL");
    }

    // 2) Groom (FACE CROP)
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(faceCropUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom-face.jpg", "image/jpeg", groomBuffer);
      } else {
        console.warn("Groom photo fetch failed:", groomRes.status);
      }
    } else {
      console.warn("Missing GROOM_PHOTO_URL");
    }

    // 3) Guest (ideally supply a face-forward selfie; your base64 might be wide)
    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const guestBuffer = Buffer.from(base64Data, "base64");
    addFile("image[]", "guest.png", "image/png", guestBuffer);

    // 4) Style reference (your “closest” sample)
    if (STYLE_REF_URL) {
      const styleRes = await fetch(styleResizeUrl(STYLE_REF_URL));
      if (styleRes.ok) {
        const styleBuffer = Buffer.from(await styleRes.arrayBuffer());
        addFile("image[]", "style-ref.jpg", "image/jpeg", styleBuffer);
      } else {
        console.warn("Style ref fetch failed:", styleRes.status);
      }
    } else {
      console.warn("Missing STYLE_REF_URL (style anchoring will be weaker)");
    }

    parts.push(`--${boundary}--\r\n`);

    const bodyParts = parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "utf-8") : p
    );
    const bodyBuffer = Buffer.concat(bodyParts);

    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
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
