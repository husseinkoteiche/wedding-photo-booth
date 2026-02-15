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
    console.log("Generating image...");

    const prompt =
      "Create an ultra-high-resolution 8K photobooth portrait featuring EXACTLY three people.\n" +
      "CRITICAL RULES:\n" +
      "• Only three humans present.\n" +
      "• Do NOT merge faces.\n" +
      "• Do NOT beautify or alter facial proportions.\n" +
      "• Preserve identity fidelity above all artistic styling.\n" +
      "• Maintain true ethnic features and natural skin texture.\n" +
      "• No additional background figures or silhouettes.\n" +
      "SUBJECT PLACEMENT:\n" +
      "Left = Bride (Subject 0)\n" +
      "Center = Guest (Subject 2)\n" +
      "Right = Groom (Subject 1)\n" +
      "--------------------------------\n" +
      "SUBJECT 0 — BRIDE (LEFT)\n" +
      "Identity source: @image0\n" +
      "Perform an identity-locked reconstruction using the exact facial geometry from @image0:\n" +
      "• preserve skull shape and cheekbone width\n" +
      "• preserve eye spacing, eyelid fold structure, and brow curvature\n" +
      "• preserve nose bridge width and tip shape\n" +
      "• preserve lip contour and philtrum depth\n" +
      "Appearance:\n" +
      "• elegant white silk wedding gown\n" +
      "• natural makeup\n" +
      "• hair styled for wedding portrait\n" +
      "• warm, joyful expression\n" +
      "--------------------------------\n" +
      "SUBJECT 1 — GROOM (RIGHT)\n" +
      "Identity source: @image1\n" +
      "Perform an identity-locked reconstruction using the exact facial structure from @image1:\n" +
      "• preserve jawline angle and chin projection\n" +
      "• preserve facial hair density and growth pattern\n" +
      "• preserve nasal structure and brow ridge\n" +
      "• preserve eye depth and spacing\n" +
      "Appearance:\n" +
      "• tailored black tuxedo\n" +
      "• crisp white shirt\n" +
      "• black bow tie\n" +
      "• relaxed confident expression\n" +
      "--------------------------------\n" +
      "SUBJECT 2 — GUEST (CENTER)\n" +
      "Identity source: @image2\n" +
      "Execute 1:1 identity transfer with absolute fidelity:\n" +
      "• replicate skin texture and pores\n" +
      "• preserve unique facial asymmetries\n" +
      "• preserve eye reflections and iris detail\n" +
      "• preserve natural skin tone variation\n" +
      "Expression:\n" +
      "• candid photobooth smile\n" +
      "• natural and relaxed\n" +
      "--------------------------------\n" +
      "STYLE: PHOTOREALISTIC CARICATURE\n" +
      "Apply subtle caricature enhancement while preserving identity:\n" +
      "• slightly enlarge heads relative to body (photobooth style)\n" +
      "• gently emphasize smiles and joyful expressions\n" +
      "• do NOT distort facial geometry beyond recognition\n" +
      "• likeness must remain instantly recognizable\n" +
      "--------------------------------\n" +
      "SETTING\n" +
      "Location: Raouche Rock terrace, Beirut\n" +
      "• empty stone terrace\n" +
      "• Mediterranean Sea in background\n" +
      "• natural coastal light\n" +
      "• warm sunset tones\n" +
      "• no tourists, no crowd, no objects\n" +
      "--------------------------------\n" +
      "LIGHTING\n" +
      "• soft golden-hour sunlight\n" +
      "• natural skin tones\n" +
      "• realistic shadows\n" +
      "• no studio lighting\n" +
      "• no beauty smoothing\n" +
      "--------------------------------\n" +
      "CAMERA & IMAGE QUALITY\n" +
      "• simulated Hasselblad X2D\n" +
      "• 80mm portrait lens\n" +
      "• f/2.8 aperture\n" +
      "• shallow depth of field\n" +
      "• sharp focus on all faces\n" +
      "• natural skin texture\n" +
      "• individual hair strands visible\n" +
      "• zero artificial smoothing\n" +
      "--------------------------------\n" +
      "TEXT OVERLAY\n" +
      "Top (white calligraphy):\n" +
      "\"Can't wait to celebrate with you\"\n" +
      "Bottom center (small elegant serif):\n" +
      "\"Hussein & Shahd — May 29, 2026\"\n" +
      "--------------------------------\n" +
      "FINAL OUTPUT REQUIREMENTS\n" +
      "• ultra-realistic skin texture\n" +
      "• accurate human anatomy\n" +
      "• natural color grading\n" +
      "• no AI artifacts\n" +
      "• no extra fingers, limbs, or distortions\n" +
      "• maintain true likeness to all source images";

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

    // @image0: Bride
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      }
    }

    // @image1: Groom
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      }
    }

    // @image2: Guest
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
