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
    // You can raise this to w_1536 or w_2048 if your Cloudinary plan allows it.
    if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_limit,w_1536,h_1536/");
    }
    return url;
  }

  try {
    console.log("Generating image...");

    // IMPORTANT:
    // - Do NOT use @image0 / @image1 / @image2 tokens (the API does not bind those).
    // - Instead: explicitly state the reference order of uploaded images.
    // - Use /v1/images/generations (NOT /edits) for best identity retention.
    const prompt =
      "You are provided THREE reference photos in this exact order via image[] uploads:\n" +
      "1) BRIDE reference photo\n" +
      "2) GROOM reference photo\n" +
      "3) GUEST reference photo\n\n" +
      "TASK: Generate ONE wedding photobooth CARICATURE illustration featuring EXACTLY THREE people: Bride (left), Guest (center), Groom (right). No extra people.\n\n" +
      "ABSOLUTE PRIORITY: Preserve facial identity from the reference photos. Each person must be immediately recognizable as their reference.\n" +
      "Do NOT invent new faces. Do NOT average faces. Do NOT swap faces. Do NOT beautify. Do NOT change ethnicity.\n\n" +
      "CARICATURE RULE (LIKELINESS-SAFE): Caricature is ONLY achieved by slightly larger heads relative to bodies + slightly amplified cheerful expressions.\n" +
      "Do NOT change facial feature geometry (no changing eye spacing, nose shape, jawline, lip shape). Preserve asymmetry and distinctive traits.\n\n" +
      "PLACEMENT: Bride on LEFT, Guest in CENTER, Groom on RIGHT.\n\n" +
      "EXPRESSIONS:\n" +
      "- Bride: BIG CHEERFUL SMILE, joyful, celebratory.\n" +
      "- Groom: BIG CHEERFUL SMILE, happy, confident.\n" +
      "- Guest: friendly natural smile.\n\n" +
      "OUTFITS:\n" +
      "- Bride: white silk wedding dress.\n" +
      "- Groom: tailored black tuxedo, white shirt, black bow tie.\n" +
      "- Guest: wedding-appropriate formal attire (neutral elegant).\n\n" +
      "SETTING: Empty stone terrace at Raouche Rock, Beirut. Mediterranean Sea background. Warm sunset atmosphere.\n" +
      "No crowds. No background people. No silhouettes. No reflections containing people.\n\n" +
      "TEXT (keep subtle, do not harm faces):\n" +
      "Top in white calligraphy: \"Can't wait to celebrate with you\"\n" +
      "Bottom center in small serif: \"Hussein & Shahd — May 29, 2026\"\n\n" +
      "NEGATIVE: extra people, crowd, silhouettes, reflections with people, merged faces, swapped faces, generic faces, beautified faces, plastic skin, anime, pixar, deformed anatomy, extra limbs/fingers.";

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

    // Fields for the Images GENERATIONS endpoint
    addField("model", "gpt-image-1");
    addField("prompt", prompt);
    addField("size", "1536x1024");
    addField("quality", "high");

    // IMPORTANT: upload reference images in the exact order the prompt describes:
    // 1) Bride, 2) Groom, 3) Guest
    // Bride
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      } else {
        console.warn("Bride photo fetch failed:", brideRes.status);
      }
    } else {
      console.warn("Missing BRIDE_PHOTO_URL");
    }

    // Groom
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      } else {
        console.warn("Groom photo fetch failed:", groomRes.status);
      }
    } else {
      console.warn("Missing GROOM_PHOTO_URL");
    }

    // Guest (base64)
    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const guestBuffer = Buffer.from(base64Data, "base64");
    addFile("image[]", "guest.png", "image/png", guestBuffer);

    parts.push(`--${boundary}--\r\n`);

    const bodyParts = parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "utf-8") : p
    );
    const bodyBuffer = Buffer.concat(bodyParts);

    // ✅ Use GENERATIONS (not edits)
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
