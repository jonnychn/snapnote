import { useEffect, useRef, useState } from "react";
import { ImagePlus, SwitchCamera, X } from "lucide-react";

export function CaptureScreen({
  onClose,
  onShot,
}: {
  onClose: () => void;
  onShot: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function start() {
      setReady(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!navigator.mediaDevices?.getUserMedia) {
        setBlocked(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setBlocked(false);
        setReady(true);
      } catch {
        if (!cancelled) setBlocked(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [facing]);

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onShot(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  function takeFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    onShot(file);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-bg">
      <div className="flex h-full w-full max-w-lg flex-col">
        <header className="safe-top flex items-center justify-between px-3 pt-2">
          <button type="button" className="press grid size-11 place-items-center" onClick={onClose} aria-label="Close camera">
            <X className="size-6" />
          </button>
          <p className="font-display text-xl">Snap</p>
          <button
            type="button"
            className="press grid size-11 place-items-center disabled:opacity-40"
            aria-label="Flip camera"
            disabled={blocked}
            onClick={() => setFacing((side) => (side === "environment" ? "user" : "environment"))}
          >
            <SwitchCamera className="size-6" />
          </button>
        </header>

        <div className="relative mx-4 mt-2 min-h-0 flex-1 overflow-hidden rounded-lg bg-surface">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover ${facing === "user" ? "mirror" : ""} ${ready ? "" : "invisible"}`}
          />
          {blocked ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="font-display text-2xl">Camera needs a tap</p>
              <p className="text-muted">
                Open your camera, or pick a photo you already took. The note comes next.
              </p>
              <button type="button" className="btn btn-primary press" onClick={() => cameraInput.current?.click()}>
                Open camera
              </button>
            </div>
          ) : null}
          {!blocked && !ready ? (
            <p className="absolute inset-0 grid place-items-center text-muted">Starting camera…</p>
          ) : null}
        </div>

        <footer className="safe-bottom flex items-center justify-between px-8 pt-5">
          <button
            type="button"
            className="press grid size-11 place-items-center rounded-full bg-surface-2"
            aria-label="Choose from library"
            onClick={() => libraryInput.current?.click()}
          >
            <ImagePlus className="size-5" />
          </button>
          <button
            type="button"
            className="press grid size-20 place-items-center rounded-full border-4 border-fg bg-primary text-primary-ink disabled:opacity-40"
            aria-label="Take photo"
            disabled={!ready}
            onClick={shoot}
          >
            <span className="size-14 rounded-full border-2 border-primary-ink/30" />
          </button>
          <span className="size-11" aria-hidden="true" />
        </footer>

        <input
          ref={cameraInput}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={libraryInput}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(event) => {
            takeFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
