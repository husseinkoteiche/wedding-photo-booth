import { useState, useRef, useCallback, useEffect } from "react";

/*
 * ─────────────────────────────────────────────
 *  PERSONALIZATION — Change these to match
 *  your wedding. This is the ONLY thing you
 *  need to edit in this file.
 * ─────────────────────────────────────────────
 */
const WEDDING = {
  coupleNames: "Sarah & James",
  weddingDate: "February 14, 2026",
};

const STEPS = { WELCOME: 0, CAMERA: 1, GENERATING: 2, RESULT: 3 };

const LOADING_MESSAGES = [
  "Getting everyone together…",
  "Arranging the flowers…",
  "Finding the perfect lighting…",
  "Say cheese!",
  "Cueing the wedding march…",
  "Almost there…",
];

export default function App() {
  const [step, setStep] = useState(STEPS.WELCOME);
  const [selfie, setSelfie] = useState(null);
  const [result, setResult] = useState(null);
  const [resultFile, setResultFile] = useState(null);
  const [error, setError] = useState("");
  const [retryData, setRetryData] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Cycle loading messages
  useEffect(() => {
    if (step !== STEPS.GENERATING) return;
    const iv = setInterval(
      () => setLoadingMsg((i) => (i + 1) % LOADING_MESSAGES.length),
      3000
    );
    return () => clearInterval(iv);
  }, [step]);

  // Pre-build shareable file when result arrives (needed for iOS share)
  useEffect(() => {
    if (!result) { setResultFile(null); return; }
    try {
      const parts = result.split(",");
      const mime = parts[0].match(/:(.*?);/)[1];
      const raw = atob(parts[1]);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const fileName = `photo-with-${WEDDING.coupleNames.replace(/\s+/g, "-")}.png`;
      setResultFile(new File([blob], fileName, { type: mime }));
    } catch (e) {
      console.log("Could not pre-build file:", e);
      setResultFile(null);
    }
  }, [result]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    setError("");
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStep(STEPS.CAMERA);
    } catch {
      setError(
        "We need camera access to take your photo. Please allow it and try again."
      );
    }
  }, []);

  // Callback ref: fires the instant the <video> element mounts in the DOM
  const attachStream = useCallback((videoEl) => {
    videoRef.current = videoEl;
    if (videoEl && streamRef.current) {
      videoEl.srcObject = streamRef.current;
      videoEl.onloadeddata = () => setVideoReady(true);
      videoEl.play().catch(() => {});
    }
  }, []);

  const snap = useCallback(() => setCountdown(3), []);

  // Countdown → auto-capture at 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        // Validate we got real image data (not a blank 0x0 canvas)
        if (dataUrl && dataUrl.length > 100) {
          setSelfie(dataUrl);
          stopCamera();
          generateImage(dataUrl);
        } else {
          setError("Camera wasn't ready. Please try again.");
          setStep(STEPS.WELCOME);
          stopCamera();
        }
      } else {
        setError("Camera wasn't ready. Please try again.");
        setStep(STEPS.WELCOME);
        stopCamera();
      }
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, stopCamera]);

  /*
   * Send selfie to our backend proxy at /api/generate
   * The backend holds the API key + bride/groom photos
   * and calls OpenAI on our behalf.
   */
  const generateImage = useCallback(async (guestDataUrl) => {
    setStep(STEPS.GENERATING);
    setLoadingMsg(0);
    setRetryData(guestDataUrl);

    try {
      const base64 = guestDataUrl.split(",")[1];

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestPhoto: base64 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResult(`data:image/png;base64,${data.image}`);
      setStep(STEPS.RESULT);
      setRetryData(null);
      console.log("Cloudinary URL:", data.cloudinaryUrl || "not uploaded");
    } catch (err) {
      console.error(err);
      setError(
        err.message === "Failed to fetch" || err.message === "Load failed"
          ? "Connection lost — your screen may have turned off. Tap Retry to try again!"
          : "Something went wrong creating your portrait. Let's try again!"
      );
      setStep(STEPS.WELCOME);
    }
  }, []);

  const startOver = () => {
    setSelfie(null);
    setResult(null);
    setResultFile(null);
    setError("");
    setRetryData(null);
    setVideoReady(false);
    setStep(STEPS.WELCOME);
  };

  const Rings = ({ size = 48 }) => (
    <svg
      width={size}
      height={size * 0.65}
      viewBox="0 0 80 52"
      fill="none"
      style={{ opacity: 0.45 }}
    >
      <ellipse cx="28" cy="26" rx="22" ry="22" stroke="#c9956b" strokeWidth="1.5" />
      <ellipse cx="52" cy="26" rx="22" ry="22" stroke="#c9956b" strokeWidth="1.5" />
    </svg>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(170deg, #141110 0%, #2a1f18 40%, #1a1410 100%)",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        color: "#f0e6d8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Josefin+Sans:wght@200;300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pop { 0% { transform:scale(.4); opacity:0 } 60% { transform:scale(1.2); opacity:1 } 100% { transform:scale(1) } }
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes shimmer { 0% { background-position:-200% center } 100% { background-position:200% center } }
        @keyframes breathe { 0%,100% { opacity:.45 } 50% { opacity:.85 } }
        @keyframes drift {
          0%,100% { transform:translate(0,0) rotate(0deg) }
          25% { transform:translate(12px,-18px) rotate(4deg) }
          50% { transform:translate(-6px,-30px) rotate(-2deg) }
          75% { transform:translate(-14px,-10px) rotate(3deg) }
        }
        @keyframes resultReveal { from { opacity:0; transform:scale(.93) } to { opacity:1; transform:scale(1) } }
        .btn {
          font-family:'Josefin Sans',sans-serif; font-weight:300;
          letter-spacing:3px; text-transform:uppercase; font-size:13px;
          padding:18px 44px; border:none; cursor:pointer;
          transition:all .35s ease;
          background:linear-gradient(135deg,#c9956b,#d4a574);
          color:#1a1410; border-radius:2px;
        }
        .btn:hover { background:linear-gradient(135deg,#d4a574,#e8c4a0); box-shadow:0 0 40px rgba(201,149,107,.25) }
        .btn:active { transform:scale(.97) }
        .btn-outline { background:transparent; border:1px solid rgba(201,149,107,.5); color:#e8c4a0 }
        .btn-outline:hover { background:rgba(201,149,107,.12); box-shadow:none }
        .video-feed { transform:scaleX(-1) }
      `}</style>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Floating petals */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: Math.random() * 8 + 3,
              height: Math.random() * 8 + 3,
              borderRadius: "50%",
              background: [
                "#c9956b",
                "#d4a574",
                "#e8c4a0",
                "#b8835a",
                "#f0d9b5",
              ][i % 5],
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.15 + Math.random() * 0.2,
              animation: `drift ${8 + Math.random() * 10}s ease-in-out infinite`,
              animationDelay: `${Math.random() * -10}s`,
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 580,
          padding: "0 20px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ─── WELCOME ─── */}
        {step === STEPS.WELCOME && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: 24,
              animation: "fadeUp .8s ease-out",
            }}
          >
            <Rings size={56} />

            <div
              style={{
                fontSize: 11,
                letterSpacing: 5,
                fontFamily: "'Josefin Sans', sans-serif",
                fontWeight: 200,
                textTransform: "uppercase",
                color: "#c9956b",
              }}
            >
              The wedding of
            </div>

            <h1
              style={{
                fontSize: "clamp(34px, 7vw, 54px)",
                fontWeight: 300,
                fontStyle: "italic",
                lineHeight: 1.15,
                letterSpacing: 1,
                background:
                  "linear-gradient(135deg, #f0e6d8, #c9956b, #f0e6d8)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 5s linear infinite",
              }}
            >
              {WEDDING.coupleNames}
            </h1>

            <div
              style={{
                fontSize: 14,
                fontFamily: "'Josefin Sans', sans-serif",
                fontWeight: 200,
                letterSpacing: 2,
                opacity: 0.5,
              }}
            >
              {WEDDING.weddingDate}
            </div>

            <div
              style={{
                width: 80,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, #c9956b, transparent)",
              }}
            />

            <p
              style={{
                fontSize: 17,
                fontStyle: "italic",
                lineHeight: 1.7,
                opacity: 0.6,
                maxWidth: 360,
              }}
            >
              Take a selfie and we'll create a beautiful photo of you with the
              happy couple
            </p>

            <button
              className="btn"
              onClick={openCamera}
              style={{ marginTop: 8 }}
            >
              Take My Photo
            </button>

            {error && (
              <div
                style={{
                  marginTop: 8,
                  padding: "14px 22px",
                  background: "rgba(180,80,60,.12)",
                  border: "1px solid rgba(180,80,60,.25)",
                  borderRadius: 4,
                  fontSize: 14,
                  fontFamily: "'Josefin Sans', sans-serif",
                  fontWeight: 300,
                  color: "#e8a090",
                  maxWidth: 380,
                  textAlign: "center",
                }}
              >
                {error}
                {retryData && (
                  <button
                    className="btn"
                    onClick={() => {
                      setError("");
                      generateImage(retryData);
                    }}
                    style={{
                      marginTop: 12,
                      padding: "12px 32px",
                      fontSize: 12,
                      display: "block",
                      width: "100%",
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── CAMERA ─── */}
        {step === STEPS.CAMERA && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              animation: "fadeUp .5s ease-out",
            }}
          >
            <p
              style={{
                fontSize: 18,
                fontStyle: "italic",
                opacity: 0.6,
                textAlign: "center",
              }}
            >
              Strike a pose with {WEDDING.coupleNames}!
            </p>

            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "3/4",
                maxHeight: "55vh",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid rgba(201,149,107,.25)",
                boxShadow: "0 24px 64px rgba(0,0,0,.5)",
              }}
            >
              <video
                ref={attachStream}
                autoPlay
                playsInline
                muted
                className="video-feed"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />

              {/* Viewfinder corners */}
              {[
                ["top", "left"],
                ["top", "right"],
                ["bottom", "left"],
                ["bottom", "right"],
              ].map(([v, h]) => (
                <div
                  key={v + h}
                  style={{
                    position: "absolute",
                    [v]: 14,
                    [h]: 14,
                    width: 24,
                    height: 24,
                    [`border${v[0].toUpperCase() + v.slice(1)}`]:
                      "1.5px solid rgba(201,149,107,.5)",
                    [`border${h[0].toUpperCase() + h.slice(1)}`]:
                      "1.5px solid rgba(201,149,107,.5)",
                  }}
                />
              ))}

              {/* Countdown overlay */}
              {countdown !== null && countdown > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,.35)",
                  }}
                >
                  <span
                    key={countdown}
                    style={{
                      fontSize: 110,
                      fontWeight: 300,
                      color: "#f0e6d8",
                      animation: "pop .45s ease-out",
                      textShadow: "0 0 50px rgba(201,149,107,.4)",
                    }}
                  >
                    {countdown}
                  </span>
                </div>
              )}
            </div>

            <button
              className="btn"
              onClick={snap}
              disabled={countdown !== null || !videoReady}
              style={{ opacity: (countdown !== null || !videoReady) ? 0.5 : 1 }}
            >
              {!videoReady ? "Starting camera…" : countdown !== null ? "Hold still…" : "Capture"}
            </button>
          </div>
        )}

        {/* ─── GENERATING ─── */}
        {step === STEPS.GENERATING && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              animation: "fadeUp .5s ease-out",
            }}
          >
            {selfie && (
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid rgba(201,149,107,.5)",
                  boxShadow: "0 8px 32px rgba(0,0,0,.4)",
                }}
              >
                <img
                  src={selfie}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)",
                  }}
                />
              </div>
            )}

            <div
              style={{
                width: 44,
                height: 44,
                border: "2px solid rgba(201,149,107,.15)",
                borderTopColor: "#c9956b",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />

            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 22,
                  fontStyle: "italic",
                  marginBottom: 10,
                  animation: "breathe 3s ease-in-out infinite",
                }}
              >
                {LOADING_MESSAGES[loadingMsg]}
              </p>
              <p
                style={{
                  fontSize: 12,
                  fontFamily: "'Josefin Sans', sans-serif",
                  fontWeight: 200,
                  letterSpacing: 1.5,
                  opacity: 0.35,
                  textTransform: "uppercase",
                }}
              >
                Creating your photo with {WEDDING.coupleNames}
              </p>
              <p
                style={{
                  fontSize: 11,
                  fontFamily: "'Josefin Sans', sans-serif",
                  fontWeight: 200,
                  letterSpacing: 1,
                  opacity: 0.3,
                  marginTop: 8,
                }}
              >
                Please keep your screen on
              </p>
            </div>
          </div>
        )}

        {/* ─── RESULT ─── */}
        {step === STEPS.RESULT && result && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              padding: "32px 0",
              animation: "fadeUp .6s ease-out",
            }}
          >
            <Rings size={40} />
            <p
              style={{
                fontSize: 24,
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              A moment to remember!
            </p>

            <div
              style={{
                width: "100%",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid rgba(201,149,107,.35)",
                boxShadow:
                  "0 24px 80px rgba(201,149,107,.12), 0 32px 64px rgba(0,0,0,.5)",
                animation: "resultReveal .8s ease-out",
              }}
            >
              <img
                src={result}
                alt="Wedding Portrait"
                style={{ width: "100%", display: "block" }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <button className="btn btn-outline" onClick={startOver}>
                Take Another
              </button>
              <button
                className="btn"
                onClick={() => {
                  // navigator.share MUST be called synchronously from tap for iOS
                  if (resultFile && navigator.share && navigator.canShare && navigator.canShare({ files: [resultFile] })) {
                    navigator.share({ files: [resultFile] }).catch(() => {});
                  } else {
                    // Fallback: download
                    const link = document.createElement("a");
                    link.href = result;
                    link.download = `photo-with-${WEDDING.coupleNames.replace(/\s+/g, "-")}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
              >
                Save Photo
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            textAlign: "center",
            padding: "24px 0",
            fontSize: 10,
            fontFamily: "'Josefin Sans', sans-serif",
            fontWeight: 200,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            opacity: 0.2,
          }}
        >
          {WEDDING.coupleNames} · Wedding Photo Booth
        </div>
      </div>
    </div>
  );
}
