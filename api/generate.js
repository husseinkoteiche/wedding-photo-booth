export const config = { maxDuration: 300 };

const PIAPI_URL = "https://api.piapi.ai/api/v1/task";

// Add Cloudinary resize transform to keep images under 2048x2048
function resizeCloudinaryUrl(url) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/c_limit,w_2048,h_2048/");
  }
  return url;
}

async function createSwapTask(apiKey, swapImage, targetImage, swapIndex, targetIndex) {
  const res = await fetch(PIAPI_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "Qubico/image-toolkit",
      task_type: "multi-face-swap",
      input: {
        swap_image: swapImage,
        target_image: targetImage,
        swap_faces_index: String(swapIndex),
        target_faces_index: String(targetIndex),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("PiAPI create error:", JSON.stringify(err));
    throw new Error(err?.message || "Failed to create swap task");
  }

  const data = await res.json();
  return data?.data?.task_id;
}

async function pollTask(apiKey, taskId, maxWait = 30000) {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(`${PIAPI_URL}/${taskId}`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) continue;

    const data = await res.json();
    const status = data?.data?.status;

    if (status === "completed") {
      const output = data?.data?.output;
      if (output?.image_url) return output.image_url;
      if (typeof output === "string") return output;
      if (output?.images?.[0]) return output.images[0];
      if (Array.isArray(output) && output[0]) return output[0];
      console.error("Unexpected output format:", JSON.stringify(data?.data));
      throw new Error("Could not find image in response");
    }

    if (status === "failed" || status === "error") {
      console.error("Task failed:", JSON.stringify(data?.data));
      throw new Error("Face swap failed");
    }
  }

  throw new Error("Face swap timed out");
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

  // Resize all Cloudinary URLs to fit within 2048x2048
  const templateUrl = resizeCloudinaryUrl(TEMPLATE_PHOTO_URL);
  const brideUrl = resizeCloudinaryUrl(BRIDE_PHOTO_URL);
  const groomUrl = resizeCloudinaryUrl(GROOM_PHOTO_URL);

  try {
    // Template photo layout (left to right):
    // Position 0 = Bride
    // Position 1 = Guest
    // Position 2 = Groom

    // Step 1: Swap bride's face onto position 0 (left person)
    console.log("Step 1: Swapping bride face...");
    const task1 = await createSwapTask(
      PIAPI_KEY,
      brideUrl,
      templateUrl,
      0,
      0
    );
    const result1 = await pollTask(PIAPI_KEY, task1);
    console.log("Step 1 done:", result1);

    // Step 2: Swap groom's face onto position 2 (right person)
    console.log("Step 2: Swapping groom face...");
    const task2 = await createSwapTask(
      PIAPI_KEY,
      groomUrl,
      result1,
      0,
      2
    );
    const result2 = await pollTask(PIAPI_KEY, task2);
    console.log("Step 2 done:", result2);

    // Step 3: Swap guest's selfie onto position 1 (middle person)
    console.log("Step 3: Swapping guest face...");
    const task3 = await createSwapTask(
      PIAPI_KEY,
      guestPhoto,
      result2,
      0,
      1
    );
    const result3 = await pollTask(PIAPI_KEY, task3);
    console.log("Step 3 done:", result3);

    return res.status(200).json({ image: result3 });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({
      error: err.message || "Something went wrong. Please try again.",
    });
  }
}
