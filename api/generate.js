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
      "Create a professional wedding photobooth CARICATURE illustration featuring EXACTLY three people.\n" +
      "CRITICAL RULES:\n" +
      "• Only three humans present.\n" +
      "• No extra people, silhouettes, or background figures.\n" +
      "• Do NOT merge faces.\n" +
      "• Preserve identity likeness with high fidelity.\n" +
      "• Maintain true ethnic features and natural skin tone.\n" +
      "• Exaggeration must enhance recognition, not distort identity.\n" +
      "SUBJECT PLACEMENT:\n" +
      "Left = Bride (Subject 0)\n" +
      "Center = Guest (Subject 2)\n" +
      "Right = Groom (Subject 1)\n" +
      "--------------------------------\n" +
      "SUBJECT 0 — BRIDE (LEFT)\n" +
      "Identity source: @image0\n" +
      "Create a recognizable caricature using the exact facial structure from @image0:\n" +
      "• preserve skull shape and cheekbone width\n" +
      "• preserve eye spacing and eyelid structure\n" +
      "• preserve nose shape and lip contour\n" +
      "• maintain natural facial asymmetry\n" +
      "Expression & Mood:\n" +
      "• BIG cheerful smile\n" +
      "• joyful wedding-day excitement\n" +
      "• warm and welcoming energy\n" +
      "Appearance:\n" +
      "• elegant white silk wedding dress\n" +
      "• soft wedding makeup\n" +
      "• styled bridal hair\n" +
      "--------------------------------\n" +
      "SUBJECT 1 — GROOM (RIGHT)\n" +
      "Identity source: @image1\n" +
      "Create a recognizable caricature using the exact facial structure from @image1:\n" +
      "• preserve jawline angle and chin projection\n" +
      "• preserve facial hair pattern and density\n" +
      "• preserve brow shape and nasal structure\n" +
      "• maintain eye depth and spacing\n" +
      "Expression & Mood:\n" +
      "• wide cheerful smile\n" +
      "• relaxed and happy\n" +
      "• confident celebratory energy\n" +
      "Appearance:\n" +
      "• tailored black tuxedo\n" +
      "• crisp white shirt\n" +
      "• black bow tie\n" +
      "--------------------------------\n" +
      "SUBJECT 2 — GUEST (CENTER)\n" +
      "Identity source: @image2\n" +
      "Execute faithful identity caricature:\n" +
      "• replicate unique facial features and asymmetry\n" +
      "• preserve skin tone and defining characteristics\n" +
      "• maintain recognizable likeness\n" +
      "Expression:\n" +
      "• natural photobooth smile\n" +
      "• friendly and relaxed\n" +
      "--------------------------------\n" +
      "CARICATURE STYLE\n" +
      "• stylized illustrated caricature\n" +
      "• slightly enlarged heads, smaller bodies (photobooth style)\n" +
      "• gently emphasize smiles and joyful expressions\n" +
      "• subtly accentuate defining facial features\n" +
      "• clean professional line work\n" +
      "• soft painterly shading\n" +
      "• vibrant yet natural colors\n" +
      "• smooth, polished wedding illustration finish\n" +
      "--------------------------------\n" +
      "SETTING\n" +
      "Raouche Rock terrace, Beirut\n" +
      "• stone terrace\n" +
      "• Mediterranean Sea backdrop\n" +
      "• warm sunset sky\n" +
      "• soft golden coastal light\n" +
      "• romantic wedding atmosphere\n" +
      "• no crowd or background people\n" +
      "--------------------------------\n" +
      "TEXT OVERLAY\n" +
      "Top (white elegant calligraphy):\n" +
      "\"Can't wait to celebrate with you\"\n" +
      "Bottom center (small refined serif):\n" +
      "\"Hussein & Shahd — May 29, 2026\"\n" +
      "--------------------------------\n" +
      "FINAL OUTPUT REQUIREMENTS\n" +
      "• instantly recognizable caricature likeness\n" +
      "• joyful wedding mood\n" +
      "• polished illustration quality\n" +
      "• clean edges and professional finish\n" +
      "• no distortions or extra limbs\n" +
      "• no visual clutter";

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
