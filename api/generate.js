export const config = { maxDuration: 300 };

// Pre-analyzed descriptions — no vision call needed
const BRIDE_DESC =
  "Oval-to-long face shape with softly tapered sides and a gently narrowing lower third. Light to light-medium skin with a neutral-warm olive-beige undertone, smooth with a natural matte finish and faint warmth across the cheeks. Moderately high and broad forehead with a centered clean hairline. Hair is medium to dark chestnut brown with subtle warm undertones, worn long past the shoulders — thick, voluminous, softly layered in loose smooth waves with rounded ends, parted near center with natural body and lift at the crown. Eyebrows are dark brown, full, dense with a straight inner portion transitioning into a gentle defined arch and tapering neatly toward the tail. Eyes are medium-sized almond-shaped with softly rounded lower lids and slightly hooded upper lids, hazel-green irises with muted earthy tones, framed by dark upper lash lines and moderately long naturally curved eyelashes. Nose is straight and refined with a narrow bridge widening subtly toward midsection, softly rounded tip. Cheekbones moderately prominent and high with mild natural fullness. Lips medium fullness with defined cupid's bow, upper lip slightly thinner than the fuller rounded lower lip, natural rose-pink color. Chin softly rounded, smooth gently defined feminine jawline. Strong well-defined eyebrows, clear hazel eyes, smooth olive-toned skin, and thick softly waved chestnut hair framing the face.";

const GROOM_DESC =
  "Long oval face with a slightly rectangular structure, straight vertical sides and a gently squared lower third with a firm masculine jawline. Light-to-medium skin with warm olive undertone, smooth with subtle natural sheen and faint redness across nose bridge and upper cheeks. Moderately high broad forehead with slightly uneven natural hairline. Hair is dark brown to nearly black, thick and dense, cut short on sides and back with more length on top — wavy and slightly tousled with natural texture, styled casually with subtle leftward sweep. Eyebrows are dark, thick, straight with mild natural arch toward outer third, full and prominent with squared inner edge. Eyes medium-sized almond-shaped with slightly heavy upper lids and straight lower lids, dark brown irises, short to moderate dark eyelashes. Nose is straight and prominent with medium-wide bridge, rounded tip with slight downward orientation, symmetrical nostrils. Cheekbones moderately defined but softened by facial hair. Full dense dark beard and mustache closely trimmed with uniform length following the jawline and chin with clean edges, mustache sitting just above upper lip. Lips medium width with modest fullness, upper lip thinner, lower lip slightly fuller, muted pink tone. Chin broad and rounded reinforced by beard, strong well-defined jawline beneath the beard. Thick dark eyebrows, deep-set brown eyes, strong nose bridge, and dense sharply contoured beard framing a defined jawline.";

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
    // Single call — detailed bride/groom descriptions are pre-baked
    // Guest identity comes from the reference photo (Image 3)
    // ============================================================
    console.log("Generating caricature...");

    const prompt =
      "Create a premium wedding caricature illustration of EXACTLY three people. " +
      "STYLE: High-quality digital caricature — slightly exaggerated proportions (bigger heads, expressive eyes, warm smiles), clean lines, vibrant colors. Like a professional wedding caricature artist. Sophisticated and elegant, NOT childish cartoon, NOT anime. " +
      "CRITICAL IDENTITY INSTRUCTIONS — each person MUST match their reference photo exactly: " +
      "ON THE LEFT — THE BRIDE (from Image 1): " +
      BRIDE_DESC +
      " She wears a beautiful flowing white wedding dress with delicate lace details, holding a small bouquet of flowers. " +
      "ON THE RIGHT — THE GROOM (from Image 2): " +
      GROOM_DESC +
      " He wears a sharp black tuxedo with a crisp white dress shirt and black bow tie. " +
      "IN THE CENTER — THE WEDDING GUEST (from Image 3): Study the guest's reference photo extremely carefully. Preserve their EXACT face shape, skin tone, hair color and style, eye color and shape, nose shape, lip shape, jawline, and every distinguishing feature (glasses, facial hair, beauty marks, dimples, freckles, etc). The caricature must be immediately recognizable as this specific person. They wear stylish formal wedding attire. " +
      "Each caricature MUST be immediately recognizable as the person in their reference photo. Preserve EXACT skin tones, hair color/style, eye color, face shape, nose shape, and all distinguishing features. Only exaggerate proportions for caricature effect — never change their actual features. " +
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
    addField("quality", "medium");

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
