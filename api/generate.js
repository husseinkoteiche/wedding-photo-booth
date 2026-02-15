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
      "Create a wedding photobooth CARICATURE illustration with EXACTLY three people and ZERO extras.\n" +
      "PRIORITY ORDER (do not violate):\n" +
      "1) Identity likeness to reference images\n" +
      "2) Correct subject count + left/center/right placement\n" +
      "3) Wedding outfits + cheerful expressions\n" +
      "4) Caricature rendering style (ONLY head-to-body exaggeration, NOT facial geometry changes)\n" +
      "5) Background/location\n" +
      "6) Text overlay (lowest priority)\n" +
      "HARD CONSTRAINTS:\n" +
      "- Only three humans: Subject 0, Subject 2, Subject 1. No other people, no silhouettes, no reflections of people.\n" +
      "- Do not blend faces. Do not average faces. Do not swap faces between subjects.\n" +
      "- Do not beautify, \"idealize,\" or change ethnicity.\n" +
      "- Do not alter facial geometry beyond what is necessary to match the references.\n" +
      "SUBJECT PLACEMENT (must match):\n" +
      "Left: Subject 0 (Bride)\n" +
      "Center: Subject 2 (Guest)\n" +
      "Right: Subject 1 (Groom)\n" +
      "--------------------------------\n" +
      "SUBJECT 0 (BRIDE, LEFT) — IDENTITY LOCK\n" +
      "Reference: @image0\n" +
      "Reconstruct her face to match @image0 with maximum fidelity:\n" +
      "- keep the same facial proportions, eye spacing, eyelid shape, nose shape, lip shape, chin shape, and cheekbone width\n" +
      "- preserve unique asymmetry and distinctive features exactly\n" +
      "Expression: BIG CHEERFUL SMILE, joyful, wedding-day excitement\n" +
      "Outfit: elegant white silk wedding dress\n" +
      "--------------------------------\n" +
      "SUBJECT 1 (GROOM, RIGHT) — IDENTITY LOCK\n" +
      "Reference: @image1\n" +
      "Reconstruct his face to match @image1 with maximum fidelity:\n" +
      "- keep the same jawline, chin projection, nose structure, brow shape, and facial hair pattern/density\n" +
      "- preserve unique asymmetry and distinctive features exactly\n" +
      "Expression: BIG CHEERFUL SMILE, happy and confident\n" +
      "Outfit: tailored black tuxedo, white shirt, black bow tie\n" +
      "--------------------------------\n" +
      "SUBJECT 2 (GUEST, CENTER) — IDENTITY LOCK\n" +
      "Reference: @image2\n" +
      "Reconstruct their face to match @image2 with maximum fidelity:\n" +
      "- preserve defining facial features and asymmetry exactly\n" +
      "Expression: friendly natural smile\n" +
      "Outfit: wedding-appropriate formal attire (neutral and elegant)\n" +
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
      "Top in white calligraphy: \"Can't wait to celebrate with you\"\n" +
      "Bottom center in small serif: \"Hussein & Shahd — May 29, 2026\"\n" +
      "\n" +
      "NEGATIVE / AVOID:\n" +
      "extra people, background people, crowd, silhouette, reflection people,\n" +
      "face blending, face merge, averaged face, swapped faces,\n" +
      "generic handsome face, generic beautiful face, beautified,\n" +
      "anime, pixar, doll-like, plastic skin, airbrushed, smooth skin,\n" +
      "wrong ethnicity, altered jawline, altered nose, altered eye spacing,\n" +
      "deformed hands, extra fingers, warped mouth, crooked teeth";

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
