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
    // ============================================================
    // STEP 1: Analyze guest selfie with GPT-4o vision
    // ============================================================
    console.log("Step 1: Analyzing guest photo with GPT-4o vision...");

    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const mimeMatch = guestPhoto.match(/^data:(image\/\w+);/);
    const guestMime = mimeMatch ? mimeMatch[1] : "image/png";

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
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this photo. How many human faces are clearly visible? For each face, briefly note their position (left, center-left, center, center-right, right) and approximate gender if obvious (male/female/unknown).

Respond ONLY in this exact JSON format, nothing else:
{"face_count": NUMBER, "faces": [{"position": "left/center/right", "gender": "male/female/unknown"}]}

If no faces are found, respond: {"face_count": 0, "faces": []}`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${guestMime};base64,${base64Data}`,
                    detail: "low",
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    let guestCount = 1;

    if (visionRes.ok) {
      const visionData = await visionRes.json();
      const visionText = visionData.choices?.[0]?.message?.content || "";
      console.log("Vision response:", visionText);

      try {
        const cleaned = visionText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.face_count > 0) {
          guestCount = parsed.face_count;
        }
      } catch (parseErr) {
        console.log("Could not parse vision response, defaulting to 1 guest");
      }
    } else {
      console.log("Vision API failed, defaulting to 1 guest");
    }

    if (guestCount > 6) guestCount = 6;
    console.log(`Detected ${guestCount} guest(s) in selfie`);

    const totalPeople = 2 + guestCount;

    // ============================================================
    // STEP 2: Build prompt using the EXACT style that works
    // ============================================================

    // Guest portion adapts to count, but keeps same style
    let guestPart;
    let placementPart;

    if (guestCount === 1) {
      guestPart =
        "Image 3 is a WEDDING GUEST — draw them as a stylized caricature but KEEP their recognizable facial features: their exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. They are wearing stylish formal attire. ";
      placementPart =
        "The bride is on the left, the guest is in the middle, and the groom is on the right. All three are standing close together, smiling and happy. ";
    } else if (guestCount === 2) {
      guestPart =
        "Image 3 has TWO WEDDING GUESTS — draw each one as a stylized caricature but KEEP their recognizable facial features: their exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. They are each wearing stylish formal attire. ";
      placementPart =
        "The bride is on the far left, the two guests are in the middle side by side, and the groom is on the far right. All four are standing close together, smiling and happy. ";
    } else {
      guestPart =
        `Image 3 has ${guestCount} WEDDING GUESTS — draw each one as a stylized caricature but KEEP their recognizable facial features: their exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. They are each wearing stylish formal attire. `;
      placementPart =
        `The bride is on the far left, the ${guestCount} guests are spread evenly in the middle, and the groom is on the far right. All ${totalPeople} are standing close together, smiling and happy. `;
    }

    const prompt =
      "Create a fun, vibrant wedding caricature illustration in a premium cartoon style. " +
      `There are exactly ${totalPeople} people in this image: ` +
      "Image 1 is the BRIDE — draw her as a stylized caricature but KEEP her recognizable facial features: her exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. She is wearing a beautiful white wedding dress. " +
      "Image 2 is the GROOM — draw him as a stylized caricature but KEEP his recognizable facial features: his exact hair color, hairstyle, skin tone, face shape, eye shape, and nose shape from the reference photo. He is wearing a sharp black tuxedo with a bow tie. " +
      guestPart +
      placementPart +
      "The background is a beautiful illustrated scene of the iconic Raouche Rock (Pigeon Rocks) in Beirut, Lebanon with the Mediterranean Sea, drawn in the same stylized cartoon style with warm sunset colors. " +
      "At the TOP of the image, there is elegant decorative text that reads: \"Can't wait to celebrate with you\" in a beautiful script/calligraphy font. " +
      "At the BOTTOM of the image, small elegant text reads: \"Hussein & Shahd — May 29, 2026\" " +
      "Style: Premium wedding caricature art, clean lines, vibrant warm colors, playful but elegant, slightly exaggerated proportions with big heads and expressive faces. " +
      "The overall mood should be joyful, celebratory, and romantic with a warm color palette of golds, pinks, and sunset oranges.";

    console.log(`Prompt built for ${totalPeople} people (${guestCount} guests)`);

    // ============================================================
    // STEP 3: Generate the caricature
    // ============================================================
    console.log("Step 3: Generating caricature...");

    const boundary =
      "----FormBoundary" + Math.random().toString(36).slice(2);
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
    addField("prompt", prompt);
    addField("size", "1536x1024");
    addField("quality", "medium");

    // Image 1: Bride
    if (BRIDE_PHOTO_URL) {
      const brideRes = await fetch(resizeUrl(BRIDE_PHOTO_URL));
      if (brideRes.ok) {
        const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
        addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);
      }
    }

    // Image 2: Groom
    if (GROOM_PHOTO_URL) {
      const groomRes = await fetch(resizeUrl(GROOM_PHOTO_URL));
      if (groomRes.ok) {
        const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
        addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);
      }
    }

    // Image 3: Guest(s) selfie
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
      console.error("OpenAI error:", JSON.stringify(errData));
      return res.status(502).json({
        error: errData?.error?.message || "AI generation failed",
      });
    }

    const data = await openaiRes.json();
    const img = data.data?.[0];

    let imageBase64 = null;
    if (img?.b64_json) {
      imageBase64 = img.b64_json;
    } else if (img?.url) {
      const imgRes = await fetch(img.url);
      if (imgRes.ok) {
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        imageBase64 = imgBuf.toString("base64");
      }
    }

    if (!imageBase64) {
      return res.status(502).json({ error: "No image returned" });
    }

    // ============================================================
    // STEP 4: Upload to Cloudinary for storage & gallery
    // ============================================================
    let cloudinaryUrl = null;
    let selfieUrl = null;
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
    const CLOUD_KEY = process.env.CLOUDINARY_API_KEY;
    const CLOUD_SECRET = process.env.CLOUDINARY_API_SECRET;

    if (CLOUD_NAME && CLOUD_KEY && CLOUD_SECRET) {
      const crypto = await import("crypto");

      async function uploadToCloudinary(imageData, mimeType, folder, fileName) {
        try {
          const timestamp = Math.floor(Date.now() / 1000);

          const sigString = `folder=${folder}&public_id=${fileName}&timestamp=${timestamp}${CLOUD_SECRET}`;
          const signature = crypto
            .createHash("sha1")
            .update(sigString)
            .digest("hex");

          const cloudForm = new URLSearchParams();
          cloudForm.append("file", `data:${mimeType};base64,${imageData}`);
          cloudForm.append("api_key", CLOUD_KEY);
          cloudForm.append("timestamp", timestamp.toString());
          cloudForm.append("signature", signature);
          cloudForm.append("folder", folder);
          cloudForm.append("public_id", fileName);

          const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            { method: "POST", body: cloudForm }
          );

          if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            console.log(`Cloudinary upload success (${fileName}):`, cloudData.secure_url);
            return cloudData.secure_url;
          } else {
            const errText = await cloudRes.text().catch(() => "unknown");
            console.log(`Cloudinary upload failed (${fileName}):`, cloudRes.status, errText);
          }
        } catch (err) {
          console.log(`Cloudinary error (${fileName}, non-critical):`, err.message);
        }
        return null;
      }

      console.log("Step 4: Uploading to Cloudinary...");

      // Shared guest folder for this session
      const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const guestFolder = `weddings/hussein-shahd-2026/guest_${sessionId}`;

      console.log(`Selfie base64 length: ${base64Data.length}, Caricature base64 length: ${imageBase64.length}`);

      // Upload both in parallel into the same guest folder
      const [caricatureResult, selfieResult] = await Promise.all([
        uploadToCloudinary(imageBase64, "image/png", guestFolder, "caricature"),
        uploadToCloudinary(base64Data, guestMime, guestFolder, "selfie"),
      ]);

      cloudinaryUrl = caricatureResult;
      selfieUrl = selfieResult;
    } else {
      console.log("Cloudinary not configured, skipping upload");
    }

    return res.status(200).json({
      image: imageBase64,
      cloudinaryUrl,
      selfieUrl,
      guestCount,
    });
  } catch (err) {
    console.error("Generate error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
}
