import { useEffect, useMemo, useState } from "react";
import { Mic, Plus } from "lucide-react";
import { appendNote, type Folder } from "@/lib/snaps/db";
import { useDictation } from "./use-dictation";

const STARTERS = ["Shopping", "Receipts", "Errands"];

export function AnnotateScreen({
  source,
  folders,
  folderId,
  onFolder,
  onCreateFolder,
  onDiscard,
  onRetake,
  onSave,
}: {
  source: Blob;
  folders: Folder[];
  folderId?: string;
  onFolder: (id: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onDiscard: () => void;
  onRetake: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const preview = useMemo(() => URL.createObjectURL(source), [source]);
  const [note, setNote] = useState("");
  const [making, setMaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [naming, setNaming] = useState(folders.length === 0);
  const dictation = useDictation((spoken) => {
    setNote((prev) => appendNote(prev, spoken));
  });

  useEffect(() => {
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name the folder first.");
      return;
    }
    setMaking(true);
    setError("");
    try {
      await onCreateFolder(trimmed);
      setNaming(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that folder.");
    } finally {
      setMaking(false);
    }
  }

  const selected = folders.find((folder) => folder.id === folderId);

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-bg">
      <form
        className="flex h-full w-full max-w-lg flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!folderId || saving) return;
          dictation.stop();
          setSaving(true);
          setError("");
          void onSave(note).catch((err: unknown) => {
            setSaving(false);
            setError(err instanceof Error ? err.message : "Couldn't save that photo.");
          });
        }}
      >
        <header className="safe-top flex items-center justify-between px-4 pt-3">
          <button type="button" className="press min-h-11 text-muted" onClick={onDiscard}>
            Discard
          </button>
          <h1 className="font-display text-xl">Why this?</h1>
          <button type="button" className="press min-h-11 text-muted" onClick={onRetake}>
            Retake
          </button>
        </header>

        <div className="mx-4 mt-2 h-40 overflow-hidden rounded-lg bg-surface">
          <img src={preview} alt="Photo you just took" className="h-full w-full object-contain" />
        </div>

        <div className="mx-4 mt-3 flex min-h-28 flex-1 flex-col">
          <textarea
            aria-label="Note"
            value={note}
            maxLength={2000}
            placeholder="Avocado, $1.29 — cheaper than last week"
            className="min-h-28 w-full flex-1 resize-none bg-transparent text-lg text-fg outline-none"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <p className="min-h-6 px-4 text-sm text-primary" aria-live="polite">
          {dictation.listening ? dictation.interim || "Listening…" : dictation.error}
        </p>

        <div className="px-4">
          <button
            type="button"
            className={`btn press w-full ${dictation.listening ? "btn-primary mic-live" : "btn-quiet"}`}
            onClick={dictation.toggle}
          >
            <Mic className="size-5" aria-hidden="true" />
            {dictation.listening ? "Tap to stop" : dictation.supported ? "Dictate" : "Keyboard mic"}
          </button>
          {!dictation.supported ? (
            <p className="mt-2 text-center text-sm text-muted">
              This browser has no live dictation. Tap the note and use the mic on your keyboard.
            </p>
          ) : null}
        </div>

        <div className="mt-4 px-4">
          <p className="text-xs uppercase tracking-widest text-faint">File in</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {folders.map((folder) => {
              const on = folder.id === folderId;
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`press min-h-11 shrink-0 rounded-full px-4 ${on ? "bg-primary text-primary-ink" : "bg-surface-2 text-fg"}`}
                  onClick={() => onFolder(folder.id)}
                >
                  {folder.name}
                </button>
              );
            })}
            <button
              type="button"
              className="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-4"
              onClick={() => setNaming(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Folder
            </button>
          </div>
          {naming ? (
            <div className="mt-2 flex flex-col gap-2">
              {folders.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="press min-h-11 rounded-full border border-border px-3 text-sm"
                      disabled={making}
                      onClick={() => void create(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  className="field"
                  value={newName}
                  maxLength={40}
                  placeholder="New folder"
                  aria-label="New folder name"
                  onChange={(event) => setNewName(event.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-quiet press shrink-0"
                  disabled={making}
                  onClick={() => void create(newName)}
                >
                  Add
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="px-4 pt-2 text-sm text-danger">{error}</p> : null}

        <div className="safe-bottom px-4 pt-3">
          <button type="submit" className="btn btn-primary press w-full" disabled={!folderId || saving}>
            {saving ? "Saving…" : selected ? `Save to ${selected.name}` : "Pick a folder"}
          </button>
        </div>
      </form>
    </div>
  );
}
