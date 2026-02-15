export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  const BRIDE_URL = (process.env.BRIDE_PHOTO_URL || "").trim();
  const GROOM_URL = (process.env.GROOM_PHOTO_URL || "").trim();

  if (!guestPhoto || !BRIDE_URL || !GROOM_URL || !REPLICATE_API_TOKEN) {
    return res.status(400).json({ error: "Missing required images or API token" });
  }

  try {
    // Step 1: Upload guest photo to Replicate's file hosting so it has a proper URL
    const base64Data = guestPhoto.includes(",")
      ? guestPhoto.split(",")[1]
      : guestPhoto;
    const guestBuffer = Buffer.from(base64Data, "base64");

    const uploadRes = await fetch("https://api.replicate.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "multipart/form-data; boundary=----GuestUpload",
      },
      body: Buffer.concat([
        Buffer.from(
          '------GuestUpload\r\nContent-Disposition: form-data; name="content"; filename="guest.png"\r\nContent-Type: image/png\r\n\r\n'
        ),
        guestBuffer,
        Buffer.from("\r\n------GuestUpload--\r\n"),
      ]),
    });

    let guestUrl;
    if (uploadRes.ok) {
      const uploadData = await uploadRes.json();
      guestUrl = uploadData.urls?.get || uploadData.url;
      console.log("Guest uploaded:", guestUrl);
    }

    // Fallback to data URI if upload fails
    if (!guestUrl) {
      guestUrl = `data:image/png;base64,${base64Data}`;
      console.log("Using data URI fallback for guest");
    }

    // Step 2: Log what we're sending (for debugging)
    console.log("BRIDE_URL:", BRIDE_URL);
    console.log("GROOM_URL:", GROOM_URL);
    console.log("Guest URL type:", guestUrl.startsWith("http") ? "URL" : "Data URI");

    // Step 3: Create prediction with Flux 2 Max
    const createRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-2-max/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            prompt:
              "A high-end, hyper-realistic wedding photograph. " +
              "SUBJECTS: The woman from index 0 is the bride on the left. " +
              "The man from index 1 is the groom on the right. " +
              "The person from index 2 is the guest in the middle. " +
              "Preserve the exact face, skin tone, hair color, hairstyle, and all facial features of each person from their reference image. " +
              "SETTING: A terrace overlooking Raouche Rock (Pigeon Rocks), Beirut, Lebanon at golden hour sunset. Mediterranean Sea behind them. " +
              "STYLE: Cinematic lighting, 8K resolution, natural skin textures, shot on Canon EOS R5 85mm f/1.4. " +
              'TEXT: "Can\'t wait to celebrate with you" at the top in elegant script. "Hussein & Shahd — May 29, 2026" at the bottom.',
            input_images: [BRIDE_URL, GROOM_URL, guestUrl],
            aspect_ratio: "16:9",
            mode: "raw",
            guidance: 3.5,
            output_format: "png",
          },
        }),
      }
    );

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      console.error("Replicate error:", JSON.stringify(errData));
      return res.status(502).json({
        error: JSON.stringify(errData) || "AI generation failed",
      });
    }

    let prediction = await createRes.json();
    console.log("Prediction status:", prediction.status);

    // Step 4: If completed immediately
    if (prediction.status === "succeeded" && prediction.output) {
      const imageUrl =
        typeof prediction.output === "string"
          ? prediction.output
          : Array.isArray(prediction.output)
          ? prediction.output[0]
          : prediction.output?.url || String(prediction.output);
      console.log("Image URL:", imageUrl);
      return res.status(200).json({ image: imageUrl });
    }

    // Step 5: Poll for completion
    const pollUrl =
      prediction.urls?.get ||
      `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const maxWait = 240000;
    const interval = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, interval));

      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });

      if (!pollRes.ok) continue;

      prediction = await pollRes.json();
      console.log("Poll status:", prediction.status);

      if (prediction.status === "succeeded") {
        const imageUrl =
          typeof prediction.output === "string"
            ? prediction.output
            : Array.isArray(prediction.output)
            ? prediction.output[0]
            : prediction.output?.url || String(prediction.output);
        console.log("Final image URL:", imageUrl);
        return res.status(200).json({ image: imageUrl });
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        console.error("Failed:", prediction.error);
        return res
          .status(502)
          .json({ error: prediction.error || "Generation failed" });
      }
    }

    return res.status(504).json({ error: "Timed out. Please try again." });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
}
