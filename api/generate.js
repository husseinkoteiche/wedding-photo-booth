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
  const STYLE_REF_URL = process.env.STYLE_REF_URL; // optional but recommended

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing API key" });
  }

  function faceCrop(url) {
    if (!url) return url;
    if (url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_thumb,g_face,w_1024,h_1024/");
    }
    return url;
  }

  function resize(url) {
    if (!url) return url;
    if (url.includes("/upload/")) {
      return url.replace("/upload/", "/upload/c_limit,w_1536,h_1024/");
    }
    return url;
  }

  try {
    console.log("Generating image…");

    const prompt = `
Create a wedding photobooth caricature illustration.

You are provided reference images in this order:
1) blank canvas
2) bride face
3) groom face
4) guest face
5) style reference

PRIORITY:
- preserve identity of bride, groom, guest
- match style reference illustration look
- cheerful expressions

RULES:
- EXACTLY three people
- bride left, guest center, groom right
- no extra people or silhouettes
- no face merging or swapping
- preserve facial geometry and ethnicity

EXPRESSIONS:
Bride and Groom: big cheerful smiles
Guest: friendly smile

CARICATURE STYLE:
- slightly larger heads
- polished illustration
- warm sunset tones

SETTING:
Raouche Rock Beirut coastline at sunset.
`;

    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const parts = [];

    function addField(name, value) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      );
    }

    function addFile(name, filename, type, buffer) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`
      );
      parts.push(buffer);
      parts.push("\r\n");
    }

    // REQUIRED
    addField("model", "gpt-image-1");
    addField("prompt", prompt);
    addField("size", "1536x1024");
    addField("quality", "high");

    // 1️⃣ blank base canvas (IMPORTANT)
    const blank = Buffer.alloc(1536 * 1024 * 3, 255);
    addFile("image[]", "base.png", "image/png", blank);

    // 2️⃣ bride
    const brideRes = await fetch(faceCrop(BRIDE_PHOTO_URL));
    const brideBuffer = Buffer.from(await brideRes.arrayBuffer());
    addFile("image[]", "bride.jpg", "image/jpeg", brideBuffer);

    // 3️⃣ groom
    const groomRes = await fetch(faceCrop(GROOM_PHOTO_URL));
    const groomBuffer = Buffer.from(await groomRes.arrayBuffer());
    addFile("image[]", "groom.jpg", "image/jpeg", groomBuffer);

    // 4️⃣ guest
    const base64Data = guestPhoto.split(",")[1] || guestPhoto;
    const guestBuffer = Buffer.from(base64Data, "base64");
    addFile("image[]", "guest.png", "image/png", guestBuffer);

    // 5️⃣ style reference (optional but powerful)
    if (STYLE_REF_URL) {
      const styleRes = await fetch(resize(STYLE_REF_URL));
      const styleBuffer = Buffer.from(await styleRes.arrayBuffer());
      addFile("image[]", "style.jpg", "image/jpeg", styleBuffer);
    }

    parts.push(`--${boundary}--\r\n`);

    const body = Buffer.concat(
      parts.map(p => (typeof p === "string" ? Buffer.from(p) : p))
    );

    const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error(err);
      return res.status(500).json({ error: err });
    }

    const data = await openaiRes.json();
    const img = data.data?.[0];

    if (img?.b64_json) {
      return res.json({ image: `data:image/png;base64,${img.b64_json}` });
    }

    return res.status(500).json({ error: "No image returned" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Generation failed" });
  }
}
