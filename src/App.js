import { useState, useRef, useCallback, useEffect } from "react";

/*
 * ──────────────────────────────────────────
 *  PERSONALIZATION — Edit these two values
 * ──────────────────────────────────────────
 *  These are the ONLY things you edit in this file.
 *  Everything else (API key, photos) is configured
 *  in Vercel's environment variables.
 */
const COUPLE_NAMES = "Hussein & Shahd";
const WEDDING_DATE = "May 29, 2026";

/* ─────────────────────────────────────────── */

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
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(0);
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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    setError("");
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
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStep(STEPS.CAMERA);
    } catch {
      setError(
        "We need camera access to take your photo. Please allow it and try again."
      );
    }
  }, []);

  const snap = useCallback(() => setCountdown(3), []);

  // Countdown → auto-capture at 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        setSelfie(dataUrl);
        stopCamera();
        generateImage(dataUrl);
      }
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, stopCamera]);

  /* ── Call our secure backend proxy ── */
  const generateImage = useCallback(async (guestDataUrl) => {
    setStep(STEPS.GENERATING);
    setLoadingMsg(0);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestPhoto: guestDataUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong");
      }

      setResult(data.image);
      setStep(STEPS.RESULT);
    } catch (err) {
      console.error(err);
      setError("Something went wrong creating your portrait. Let's try again!");
      setStep(STEPS.WELCOME);
    }
  }, []);

  const startOver = () => {
    setSelfie(null);
    setResult(null);
    setError("");
    setStep(STEPS.WELCOME);
  };

  /* ── Share via native share sheet (mobile) ── */
  const sharePhoto = async () => {
    if (!result) return;
    try {
      if (result.startsWith("data:")) {
        const res = await fetch(result);
        const blob = await res.blob();
        const file = new File([blob], "wedding-photo.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: `Photo with ${COUPLE_NAMES}`,
            files: [file],
          });
          return;
        }
      }
      // Fallback: share URL
      await navigator.share?.({
        title: `Photo with ${COUPLE_NAMES}`,
        text: `Check out my photo with ${COUPLE_NAMES}!`,
      });
    } catch {
      // User cancelled or share not supported — ignore
    }
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
        html, body, #root { min-height: 100vh; }

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
              background: ["#c9956b", "#d4a574", "#e8c4a0", "#b8835a", "#f0d9b5"][
                i % 5
              ],
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
              {COUPLE_NAMES}
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
              {WEDDING_DATE}
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
                }}
              >
                {error}
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
              Strike a pose with {COUPLE_NAMES}!
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
                ref={videoRef}
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
              disabled={countdown !== null}
              style={{ opacity: countdown !== null ? 0.5 : 1 }}
            >
              {countdown !== null ? "Hold still…" : "Capture"}
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
                  border: "2px solid rgba(201,149,107,.4)",
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
                Creating your photo with {COUPLE_NAMES}
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
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <button className="btn btn-outline" onClick={startOver}>
                Take Another
              </button>
              {typeof navigator !== "undefined" && navigator.share && (
                <button className="btn btn-outline" onClick={sharePhoto}>
                  Share
                </button>
              )}
              <a
                href={result}
                download={`photo-with-${COUPLE_NAMES.replace(/\s+/g, "-")}.png`}
                className="btn"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Save Photo
              </a>
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
          {COUPLE_NAMES} · Wedding Photo Booth
        </div>
      </div>
    </div>
  );
}
