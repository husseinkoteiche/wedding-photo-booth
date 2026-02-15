export const config = { maxDuration: 60 };

import sharp from "sharp";

const PIAPI_URL = "https://api.piapi.ai/api/v1/task";

// Resize Cloudinary URLs to stay under limits
function resizeCloudinaryUrl(url) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/c_limit,w_1024,h_1024/");
  }
  return url;
}

async function fetchImageBuffer(urlOrBase64) {
  if (urlOrBase64.startsWith("data:")) {
    const base64Data = urlOrBase64.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }
  const res = await fetch(urlOrBase64);
  if (!res.ok) throw new Error("Failed to fetch image: " + urlOrBase64);
  return Buffer.from(await res.arrayBuffer());
}

async function compositeThreeFaces(brideBuf, guestBuf, groomBuf) {
  // Resize all three to same height (400px), then place side by side
  const targetHeight = 400;

  const brideResized = await sharp(brideBuf)
    .resize({ height: targetHeight, fit: "cover" })
    .jpeg()
    .toBuffer();
  const guestResized = await sharp(guestBuf)
    .resize({ height: targetHeight, fit: "cover" })
    .jpeg()
    .toBuffer();
  const groomResized = await sharp(groomBuf)
    .resize({ height: targetHeight, fit: "cover" })
    .jpeg()
    .toBuffer();

  // Get dimensions of each resized image
  const brideMeta = await sharp(brideResized).metadata();
  const guestMeta = await sharp(guestResized).metadata();
  const groomMeta = await sharp(groomResized).metadata();

  const totalWidth = brideMeta.width + guestMeta.width + groomMeta.width;

  // Create a canvas and place them side by side: bride | guest | groom
  // This order matches the template: position 0=bride(left), 1=guest(middle), 2=groom(right)
  const composite = await sharp({
    create: {
      width: totalWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: brideResized, left: 0, top: 0 },
      { input: guestResized, left: brideMeta.width, top: 0 },
      { input: groomResized, left: brideMeta.width + guestMeta.width, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();

  // Convert to base64 data URL
  return "data:image/jpeg;base64," + composite.toString("base64");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestPhoto } = req.body;

  if (!guestPhoto) {
    return res.status(400).json({ error: "No guest photo provided" });
  }

  const PIAPI_KEY = process.env.PIAPI_KEY;
  const TEMPLATE_PHOTO_URL = process.env.TEMPLATE_PHOTO_URL;
  const BRIDE_PHOTO_URL = process.env.BRIDE_PHOTO_URL;
  const GROOM_PHOTO_URL = process.env.GROOM_PHOTO_URL;

  if (!PIAPI_KEY) {
    return res.status(500).json({ error: "Missing PiAPI key" });
  }
  if (!TEMPLATE_PHOTO_URL) {
    return res.status(500).json({ error: "Missing template photo URL" });
  }

  const templateUrl = resizeCloudinaryUrl(TEMPLATE_PHOTO_URL);
  const brideUrl = resizeCloudinaryUrl(BRIDE_PHOTO_URL);
  const groomUrl = resizeCloudinaryUrl(GROOM_PHOTO_URL);

  try {
    // Step 1: Fetch all three source face images
    console.log("Fetching source images...");
    const [brideBuf, groomBuf, guestBuf] = await Promise.all([
      fetchImageBuffer(brideUrl),
      fetchImageBuffer(groomUrl),
      fetchImageBuffer(guestPhoto),
    ]);

    // Step 2: Composite into one image: bride | guest | groom (left to right)
    console.log("Compositing faces...");
    const compositeBase64 = await compositeThreeFaces(brideBuf, guestBuf, groomBuf);

    // Step 3: Single multi-face-swap call
    // Composite faces order: 0=bride, 1=guest, 2=groom
    // Template faces order: 0=bride(left), 1=guest(middle), 2=groom(right)
    console.log("Starting face swap...");
    const createRes = await fetch(PIAPI_URL, {
      method: "POST",
      headers: {
        "x-api-key": PIAPI_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Qubico/image-toolkit",
        task_type: "multi-face-swap",
        input: {
          swap_image: compositeBase64,
          target_image: templateUrl,
          swap_faces_index: "0,1,2",
          target_faces_index: "0,1,2",
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      console.error("PiAPI create error:", JSON.stringify(err));
      throw new Error(err?.message || "Failed to create swap task");
    }

    const createData = await createRes.json();
    const taskId = createData?.data?.task_id;

    if (!taskId) {
      throw new Error("No task ID returned");
    }

    // Step 4: Poll for result (single task, should be fast)
    console.log("Polling task:", taskId);
    const startTime = Date.now();
    const maxWait = 50000; // 50 seconds

    while (Date.now() - startTime < maxWait) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await fetch(`${PIAPI_URL}/${taskId}`, {
        method: "GET",
        headers: { "x-api-key": PIAPI_KEY },
      });

      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData?.data?.status;

      if (status === "completed") {
        const output = pollData?.data?.output;
        const imageUrl =
          output?.image_url ||
          (typeof output === "string" ? output : null) ||
          output?.images?.[0] ||
          (Array.isArray(output) ? output[0] : null);

        if (!imageUrl) {
          console.error("No image in output:", JSON.stringify(pollData?.data));
          throw new Error("No image in response");
        }

        console.log("Done! Image:", imageUrl);
        return res.status(200).json({ image: imageUrl });
      }

      if (status === "failed" || status === "error") {
        console.error("Task failed:", JSON.stringify(pollData?.data));
        throw new Error(
          pollData?.data?.error?.message || "Face swap failed"
        );
      }

      console.log("Status:", status);
    }

    throw new Error("Face swap timed out");
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({
      error: err.message || "Something went wrong. Please try again.",
    });
  }
}
