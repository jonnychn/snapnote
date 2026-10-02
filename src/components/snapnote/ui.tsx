import { useEffect, useId, useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { mediaUrl } from "@/lib/snaps/db";

export function Photo({
  id,
  kind,
  alt,
  className,
  fit = "cover",
}: {
  id: string;
  kind: "thumb" | "full";
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    mediaUrl(id, kind).then(
      (next) => {
        if (live) setUrl(next);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [id, kind]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-surface-2 text-faint ${className ?? ""}`}>
        <ImageOff className="size-6" aria-hidden="true" />
      </div>
    );
  }

  if (!url) {
    return <div className={`animate-pulse bg-surface-2 motion-reduce:animate-none ${className ?? ""}`} />;
  }

  return (
    <img
      src={url}
      alt={alt}
      decoding="async"
      className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className ?? ""}`}
    />
  );
}

export function NameDialog({
  title,
  initial,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  initial: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={fieldId}
        className="safe-bottom w-full max-w-lg rounded-t-lg border border-border bg-surface px-5 pt-5 sm:rounded-lg"
      >
        <h2 id={fieldId} className="font-display text-2xl">
          {title}
        </h2>
        <form
          className="mt-4 flex flex-col gap-3 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = value.trim();
            if (!name) {
              setError("Give the folder a name.");
              return;
            }
            onConfirm(name);
          }}
        >
          <input
            autoFocus
            className="field"
            value={value}
            maxLength={40}
            placeholder="Shopping"
            aria-label="Folder name"
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet press flex-1" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary press flex-1">
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="safe-bottom w-full max-w-lg rounded-t-lg border border-border bg-surface px-5 pt-5 sm:rounded-lg"
      >
        <h2 id={titleId} className="font-display text-2xl">
          {title}
        </h2>
        <p className="mt-2 text-muted">{body}</p>
        <div className="mt-5 flex gap-2 pb-2">
          <button type="button" className="btn btn-quiet press flex-1" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger-fill press flex-1" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UndoBanner({
  message,
  lift,
  onUndo,
}: {
  message: string;
  lift: boolean;
  onUndo: () => void;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${lift ? "bottom-28" : "bottom-6"} safe-bottom`}
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
        <p>{message}</p>
        <button type="button" className="press min-h-11 font-medium text-primary" onClick={onUndo}>
          Undo
        </button>
      </div>
    </div>
  );
}

export function EmptyMark() {
  return (
    <div className="mx-auto grid size-16 place-items-center rounded-full border border-border text-primary">
      <Camera className="size-7" aria-hidden="true" />
    </div>
  );
}

export function formatWhen(timestamp: number) {
  const delta = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "Just now";
  if (delta < hour) {
    const n = Math.floor(delta / minute);
    return `${n} min ago`;
  }
  if (delta < day) {
    const n = Math.floor(delta / hour);
    return `${n} hr ago`;
  }
  if (delta < 7 * day) {
    const n = Math.floor(delta / day);
    return n === 1 ? "Yesterday" : `${n} days ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
