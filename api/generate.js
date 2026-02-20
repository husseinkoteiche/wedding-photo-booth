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
    // STEP 1: Analyze guest selfie with GPT-4o vision
    // ============================================================
    console.log("Step 1: Analyzing guest photo with GPT-4o vision...");

    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const mimeMatch = guestPhoto.match(/^data:(image\/\w+);/);
    const guestMime = mimeMatch ? mimeMatch[1] : "image/png";

    const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    let guestCount = 1;
    let guestFaces = [{ position: "center", gender: "unknown" }];

    if (visionRes.ok) {
      const visionData = await visionRes.json();
      const visionText = visionData.choices?.[0]?.message?.content || "";
      console.log("Vision response:", visionText);

      try {
        const cleaned = visionText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.face_count > 0 && parsed.faces?.length > 0) {
          guestCount = parsed.face_count;
          guestFaces = parsed.faces;
        }
      } catch (parseErr) {
        console.log("Could not parse vision response, defaulting to 1 guest");
      }
    } else {
      console.log("Vision API failed, defaulting to 1 guest");
    }

    // Cap at reasonable number
    if (guestCount > 6) guestCount = 6;

    console.log(`Detected ${guestCount} guest(s) in selfie`);

    // ============================================================
    // STEP 2: Build dynamic prompt based on face count
    // ============================================================
    const totalPeople = 2 + guestCount; // bride + groom + guests

    // Build guest subject blocks
    let guestSubjects = "";
    let guestPlacement = "";

    if (guestCount === 1) {
      guestPlacement = "Center: Guest (from @image2)";
      guestSubjects =
        "GUEST (CENTER) — IDENTITY LOCK\n" +
        "Reference: @image2\n" +
        "Reconstruct their face to match @image2 with maximum fidelity:\n" +
        "- preserve defining facial features and asymmetry exactly\n" +
        "Expression: friendly natural smile\n" +
        "Outfit: wedding-appropriate formal attire (neutral and elegant)\n";
    } else if (guestCount === 2) {
      guestPlacement =
        "Center-Left: Guest 1 (first person in @image2)\n" +
        "Center-Right: Guest 2 (second person in @image2)";
      guestSubjects =
        "GUEST 1 (CENTER-LEFT) — IDENTITY LOCK\n" +
        "Reference: first person visible in @image2 (on the left side of the photo)\n" +
        "Reconstruct their face with maximum fidelity from @image2.\n" +
        "- preserve defining facial features and asymmetry exactly\n" +
        `- approximate gender: ${guestFaces[0]?.gender || "unknown"}\n` +
        "Expression: friendly natural smile\n" +
        "Outfit: wedding-appropriate formal attire\n" +
        "--------------------------------\n" +
        "GUEST 2 (CENTER-RIGHT) — IDENTITY LOCK\n" +
        "Reference: second person visible in @image2 (on the right side of the photo)\n" +
        "Reconstruct their face with maximum fidelity from @image2.\n" +
        "- preserve defining facial features and asymmetry exactly\n" +
        `- approximate gender: ${guestFaces[1]?.gender || "unknown"}\n` +
        "Expression: friendly natural smile\n" +
        "Outfit: wedding-appropriate formal attire\n";
    } else {
      // 3+ guests
      const guestLabels = [];
      const guestBlocks = [];
      for (let i = 0; i < guestCount; i++) {
        const label = `Guest ${i + 1}`;
        const pos = guestFaces[i]?.position || "center";
        const gender = guestFaces[i]?.gender || "unknown";
        guestLabels.push(`${label} (from @image2)`);
        guestBlocks.push(
          `${label.toUpperCase()} — IDENTITY LOCK\n` +
            `Reference: person ${i + 1} in @image2 (${pos} of the photo)\n` +
            `Reconstruct their face with maximum fidelity from @image2.\n` +
            `- preserve defining facial features exactly\n` +
            `- approximate gender: ${gender}\n` +
            `Expression: friendly natural smile\n` +
            `Outfit: wedding-appropriate formal attire\n`
        );
      }
      guestPlacement =
        "Between Bride and Groom (spread evenly): " +
        guestLabels.join(", ");
      guestSubjects = guestBlocks.join("--------------------------------\n");
    }

    const prompt =
      `Create a wedding photobooth CARICATURE illustration with EXACTLY ${totalPeople} people and ZERO extras.\n` +
      "PRIORITY ORDER (do not violate):\n" +
      "1) Identity likeness to reference images\n" +
      "2) Correct subject count + placement\n" +
      "3) Wedding outfits + cheerful expressions\n" +
      "4) Caricature rendering style (ONLY head-to-body exaggeration, NOT facial geometry changes)\n" +
      "5) Background/location\n" +
      "6) Text overlay (lowest priority)\n" +
      "HARD CONSTRAINTS:\n" +
      `- EXACTLY ${totalPeople} humans total: 1 Bride, 1 Groom, and ${guestCount} guest(s). No other people, no silhouettes, no reflections.\n` +
      "- Do not blend faces. Do not average faces. Do not swap faces between subjects.\n" +
      '- Do not beautify, "idealize," or change ethnicity.\n' +
      "- Do not alter facial geometry beyond what is necessary to match the references.\n" +
      `- The guest photo (@image2) contains ${guestCount} person(s). You MUST extract ALL ${guestCount} face(s) from it and include each one as a separate person in the illustration.\n` +
      "SUBJECT PLACEMENT (left to right):\n" +
      "Far Left: Bride (from @image0)\n" +
      guestPlacement +
      "\n" +
      "Far Right: Groom (from @image1)\n" +
      "--------------------------------\n" +
      "BRIDE (FAR LEFT) — IDENTITY LOCK\n" +
      "Reference: @image0\n" +
      "Reconstruct her face to match @image0 with maximum fidelity:\n" +
      "- keep the same facial proportions, eye spacing, eyelid shape, nose shape, lip shape, chin shape, and cheekbone width\n" +
      "- preserve unique asymmetry and distinctive features exactly\n" +
      "Expression: BIG CHEERFUL SMILE, joyful, wedding-day excitement\n" +
      "Outfit: elegant white silk wedding dress\n" +
      "--------------------------------\n" +
      "GROOM (FAR RIGHT) — IDENTITY LOCK\n" +
      "Reference: @image1\n" +
      "Reconstruct his face to match @image1 with maximum fidelity:\n" +
      "- keep the same jawline, chin projection, nose structure, brow shape, and facial hair pattern/density\n" +
      "- preserve unique asymmetry and distinctive features exactly\n" +
      "Expression: BIG CHEERFUL SMILE, happy and confident\n" +
      "Outfit: tailored black tuxedo, white shirt, black bow tie\n" +
      "--------------------------------\n" +
      guestSubjects +
      "--------------------------------\n" +
      "CARICATURE RENDERING (LIKELINESS-SAFE)\n" +
      "This is a caricature ONLY by:\n" +
      "- slightly larger heads relative to bodies (photobooth caricature)\n" +
      "- slightly amplified smiles and cheek lift\n" +
      "DO NOT change facial feature sizes, spacing, or bone structure.\n" +
      "Style: clean professional caricature illustration, crisp linework, smooth shading, polished wedding-booth look.\n" +
      "--------------------------------\n" +
      "SETTING\n" +
      "Raouche Rock terrace, Beirut.\n" +
      "Empty stone terrace. Mediterranean Sea in the background. Warm sunset atmosphere.\n" +
      "No crowds. No background people. No props that block faces.\n" +
      "--------------------------------\n" +
      "TEXT OVERLAY (LOWEST PRIORITY)\n" +
      'Top in white calligraphy: "Can\'t wait to celebrate with you"\n' +
      'Bottom center in small serif: "Hussein & Shahd — May 29, 2026"\n' +
      "\n" +
      "NEGATIVE / AVOID:\n" +
      "extra people, background people, crowd, silhouette, reflection people,\n" +
      "face blending, face merge, averaged face, swapped faces,\n" +
      "generic handsome face, generic beautiful face, beautified,\n" +
      "anime, pixar, doll-like, plastic skin, airbrushed, smooth skin,\n" +
      "wrong ethnicity, altered jawline, altered nose, altered eye spacing,\n" +
      "deformed hands, extra fingers, warped mouth, crooked teeth";

    console.log(`Prompt built for ${totalPeople} people (${guestCount} guests)`);

    // ============================================================
    // STEP 3: Generate the caricature with gpt-image-1
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

    // @image2: Guest(s) selfie
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
      return res.status(200).json({
        image: `data:image/png;base64,${img.b64_json}`,
        guestCount,
      });
    } else if (img?.url) {
      return res.status(200).json({ image: img.url, guestCount });
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
