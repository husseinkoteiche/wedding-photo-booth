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
    // ============================================================
    // STEP 1: Use GPT-4o vision to analyze all 3 faces in detail
    // This is the "translation layer" that makes ChatGPT caricatures so good
    // ============================================================
    console.log("Step 1: Analyzing faces with GPT-4o vision...");

    const guestDataUri = guestPhoto.startsWith("data:")
      ? guestPhoto
      : `data:image/png;base64,${guestPhoto.includes(",") ? guestPhoto.split(",")[1] : guestPhoto}`;

    const visionRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a professional portrait artist assistant. Analyze photos and produce extremely detailed physical descriptions. For each person, describe: face shape (oval/round/square/heart), exact skin tone shade, hair color and style (length, texture, parting), eye shape and color, eyebrow shape and thickness, nose shape (bridge width, tip), lip shape, jawline, cheekbone prominence, facial hair if any, distinctive features (dimples, freckles, moles, glasses, beauty marks). Be extremely specific — these descriptions will be used to recreate their likeness. Keep each to 2-3 dense sentences.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Analyze these 3 photos. Photo 1 = BRIDE, Photo 2 = GROOM, Photo 3 = GUEST. Give me hyper-detailed physical descriptions to recreate each face. Format EXACTLY as:\n\nBRIDE: [description]\nGROOM: [description]\nGUEST: [description]',
                },
                {
                  type: "image_url",
                  image_url: { url: resizeUrl(BRIDE_PHOTO_URL), detail: "high" },
                },
                {
                  type: "image_url",
                  image_url: { url: resizeUrl(GROOM_PHOTO_URL), detail: "high" },
                },
                {
                  type: "image_url",
                  image_url: { url: guestDataUri, detail: "high" },
                },
              ],
            },
          ],
          max_tokens: 600,
          temperature: 0.2,
        }),
      }
    );

    let brideDesc = "a woman with Middle Eastern features";
    let groomDesc = "a man with Middle Eastern features";
    let guestDesc = "a person";

    if (visionRes.ok) {
      const visionData = await visionRes.json();
      const analysis = visionData.choices?.[0]?.message?.content || "";
      console.log("Face analysis result:", analysis);

      const brideMatch = analysis.match(/BRIDE:\s*(.+?)(?=\nGROOM:|$)/s);
      const groomMatch = analysis.match(/GROOM:\s*(.+?)(?=\nGUEST:|$)/s);
      const guestMatch = analysis.match(/GUEST:\s*(.+?)$/s);

      if (brideMatch) brideDesc = brideMatch[1].trim();
      if (groomMatch) groomDesc = groomMatch[1].trim();
      if (guestMatch) guestDesc = guestMatch[1].trim();
    } else {
      const err = await visionRes.json().catch(() => ({}));
      console.error("Vision step failed, using fallback:", JSON.stringify(err));
    }

    // ============================================================
    // STEP 2: Generate caricature with detailed descriptions
    // + original reference photos attached
    // ============================================================
    console.log("Step 2: Generating caricature...");

    const prompt =
      "Create a premium wedding caricature illustration of EXACTLY three people. " +
      "STYLE: High-quality digital caricature — slightly exaggerated proportions (bigger heads, expressive eyes, warm smiles), clean lines, vibrant colors. Like a professional wedding caricature artist. NOT childish cartoon, NOT anime — sophisticated caricature art. " +
      "CRITICAL IDENTITY INSTRUCTIONS — each person MUST match their reference photo: " +
      "ON THE LEFT — THE BRIDE (from Image 1): " + brideDesc + ". She wears a beautiful flowing white wedding dress with delicate lace details, holding a small bouquet of flowers. " +
      "ON THE RIGHT — THE GROOM (from Image 2): " + groomDesc + ". He wears a sharp black tuxedo with a crisp white dress shirt and black bow tie. " +
      "IN THE CENTER — THE WEDDING GUEST (from Image 3): " + guestDesc + ". They wear stylish formal wedding attire. " +
      "Each caricature MUST be immediately recognizable as the person in their reference photo. Preserve their EXACT skin tone, hair color and style, eye color, face shape, nose shape, and all distinguishing features. Only exaggerate proportions for caricature effect — never change their actual features. " +
      "POSE: All three standing close together, arms around each other, genuinely smiling and radiating joy. " +
      "BACKGROUND: Raouche Rock (Pigeon Rocks) in Beirut, Lebanon with the Mediterranean Sea, illustrated in the same warm caricature style with a breathtaking golden hour sunset. " +
      'TEXT: Elegant decorative script at the top: "Can\'t wait to celebrate with you" — ' +
      'Smaller elegant text at the bottom: "Hussein & Shahd — May 29, 2026" ' +
      "COLORS: Warm golds, sunset oranges, soft pinks, romantic tones throughout.";

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

    // Attach bride photo
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      }
    }

    // Attach groom photo
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      }
    }

    // Attach guest selfie
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
