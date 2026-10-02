import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Mic,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { appendNote, storageMessage, type Folder, type Snap } from "@/lib/snaps/db";
import { useSnapStore, type DeletedSnap } from "@/lib/snaps/store";
import { AnnotateScreen } from "./annotate";
import { CaptureScreen } from "./capture";
import { useDictation } from "./use-dictation";
import {
  ConfirmDialog,
  EmptyMark,
  NameDialog,
  Photo,
  UndoBanner,
  formatWhen,
  plural,
} from "./ui";

type Screen =
  | { kind: "home" }
  | { kind: "folder"; folderId: string }
  | { kind: "detail"; snapId: string }
  | { kind: "capture"; folderId?: string }
  | { kind: "annotate"; source: Blob; folderId?: string };

type Dialog =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; folder: Folder }
  | { kind: "delete-folder"; folder: Folder }
  | { kind: "discard" }
  | { kind: "menu"; folder: Folder };

export function SnapnoteApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Boot />;
  return <ReadyApp />;
}

function Boot() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-8">
      <p className="text-xs uppercase tracking-widest text-muted">On the go</p>
      <h1 className="font-display text-4xl">Snapnote</h1>
    </main>
  );
}

function ReadyApp() {
  const status = useSnapStore((s) => s.status);
  const error = useSnapStore((s) => s.error);
  const folders = useSnapStore((s) => s.folders);
  const snaps = useSnapStore((s) => s.snaps);
  const init = useSnapStore((s) => s.init);
  const createFolder = useSnapStore((s) => s.createFolder);
  const renameFolder = useSnapStore((s) => s.renameFolder);
  const deleteFolder = useSnapStore((s) => s.deleteFolder);
  const saveSnap = useSnapStore((s) => s.saveSnap);
  const deleteSnap = useSnapStore((s) => s.deleteSnap);
  const restoreSnap = useSnapStore((s) => s.restoreSnap);

  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [undo, setUndo] = useState<DeletedSnap | null>(null);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const orderedFolders = useMemo(
    () => [...folders].sort((a, b) => b.updatedAt - a.updatedAt),
    [folders],
  );

  function latestIn(folderId: string) {
    return snaps
      .filter((snap) => snap.folderId === folderId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  async function run<T>(work: () => Promise<T>) {
    setBanner("");
    try {
      return await work();
    } catch (err) {
      setBanner(storageMessage(err));
      return undefined;
    }
  }

  async function removePhoto(id: string) {
    const deleted = await run(() => deleteSnap(id));
    if (!deleted) return;
    setUndo(deleted);
    if (screen.kind === "detail" && screen.snapId === id) {
      const folderId = deleted.snap.folderId;
      setScreen(folders.some((folder) => folder.id === folderId) ? { kind: "folder", folderId } : { kind: "home" });
    }
  }

  if (status === "loading") return <Boot />;
  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 text-center">
        <h1 className="font-display text-3xl">Notes stayed put</h1>
        <p className="mt-2 text-muted">{error}</p>
      </main>
    );
  }

  const lift = screen.kind === "home" || screen.kind === "folder";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      {screen.kind === "home" ? (
        <HomeScreen
          folders={orderedFolders}
          snaps={snaps}
          query={query}
          onQuery={setQuery}
          latestIn={latestIn}
          onOpenFolder={(folderId) => setScreen({ kind: "folder", folderId })}
          onOpenSnap={(snapId) => setScreen({ kind: "detail", snapId })}
          onCreate={() => setDialog({ kind: "create" })}
          onSnap={() => setScreen({ kind: "capture" })}
        />
      ) : null}

      {screen.kind === "folder"
        ? (() => {
            const folder = folders.find((item) => item.id === screen.folderId);
            if (!folder) {
              return null;
            }
            const photos = snaps
              .filter((snap) => snap.folderId === folder.id)
              .sort((a, b) => b.createdAt - a.createdAt);
            return (
              <FolderScreen
                folder={folder}
                photos={photos}
                onBack={() => setScreen({ kind: "home" })}
                onOpen={(snapId) => setScreen({ kind: "detail", snapId })}
                onMenu={() => setDialog({ kind: "menu", folder })}
                onSnap={() => setScreen({ kind: "capture", folderId: folder.id })}
              />
            );
          })()
        : null}

      {screen.kind === "detail"
        ? (() => {
            const snap = snaps.find((item) => item.id === screen.snapId);
            if (!snap) return null;
            return (
              <DetailScreen
                snap={snap}
                folders={orderedFolders}
                onBack={() => {
                  const still = folders.some((folder) => folder.id === snap.folderId);
                  setScreen(still ? { kind: "folder", folderId: snap.folderId } : { kind: "home" });
                }}
                onDelete={() => void removePhoto(snap.id)}
              />
            );
          })()
        : null}

      {screen.kind === "capture" ? (
        <CaptureScreen
          onClose={() =>
            setScreen(screen.folderId ? { kind: "folder", folderId: screen.folderId } : { kind: "home" })
          }
          onShot={(source) => setScreen({ kind: "annotate", source, folderId: screen.folderId })}
        />
      ) : null}

      {screen.kind === "annotate" ? (
        <AnnotateScreen
          source={screen.source}
          folders={orderedFolders}
          folderId={screen.folderId}
          onFolder={(folderId) => setScreen({ ...screen, folderId })}
          onCreateFolder={async (name) => {
            const folder = await createFolder(name);
            setScreen((current) =>
              current.kind === "annotate" ? { ...current, folderId: folder.id } : current,
            );
          }}
          onDiscard={() => setDialog({ kind: "discard" })}
          onRetake={() => setScreen({ kind: "capture", folderId: screen.folderId })}
          onSave={async (note) => {
            if (!screen.folderId) return;
            try {
              const snap = await saveSnap({
                folderId: screen.folderId,
                source: screen.source,
                note,
              });
              setScreen({ kind: "detail", snapId: snap.id });
            } catch (err) {
              throw new Error(storageMessage(err));
            }
          }}
        />
      ) : null}

      {dialog.kind === "create" ? (
        <NameDialog
          title="New folder"
          initial=""
          confirmLabel="Create"
          onCancel={() => setDialog({ kind: "none" })}
          onConfirm={(name) => {
            void run(() => createFolder(name));
            setDialog({ kind: "none" });
          }}
        />
      ) : null}

      {dialog.kind === "rename" ? (
        <NameDialog
          title="Rename folder"
          initial={dialog.folder.name}
          confirmLabel="Rename"
          onCancel={() => setDialog({ kind: "none" })}
          onConfirm={(name) => {
            void run(() => renameFolder(dialog.folder.id, name));
            setDialog({ kind: "none" });
          }}
        />
      ) : null}

      {dialog.kind === "delete-folder" ? (
        <ConfirmDialog
          title={`Delete ${dialog.folder.name}?`}
          body={`This removes the folder and ${plural(
            snaps.filter((snap) => snap.folderId === dialog.folder.id).length,
            "photo",
          )}. You can't undo a folder.`}
          confirmLabel="Delete folder"
          onCancel={() => setDialog({ kind: "none" })}
          onConfirm={() => {
            const id = dialog.folder.id;
            setDialog({ kind: "none" });
            void run(async () => {
              await deleteFolder(id);
              setScreen({ kind: "home" });
            });
          }}
        />
      ) : null}

      {dialog.kind === "discard" ? (
        <ConfirmDialog
          title="Discard this snap?"
          body="The photo and note won't be saved."
          confirmLabel="Discard"
          onCancel={() => setDialog({ kind: "none" })}
          onConfirm={() => {
            setDialog({ kind: "none" });
            setScreen(
              screen.kind === "annotate" && screen.folderId
                ? { kind: "folder", folderId: screen.folderId }
                : { kind: "home" },
            );
          }}
        />
      ) : null}

      {dialog.kind === "menu" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${dialog.folder.name} actions`}
            className="safe-bottom w-full max-w-lg rounded-t-lg border border-border bg-surface px-4 pt-3"
          >
            <p className="px-2 pb-2 font-display text-2xl">{dialog.folder.name}</p>
            <button
              type="button"
              className="press flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left"
              onClick={() => setDialog({ kind: "rename", folder: dialog.folder })}
            >
              <Pencil className="size-5" aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              className="press flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-danger"
              onClick={() => setDialog({ kind: "delete-folder", folder: dialog.folder })}
            >
              <Trash2 className="size-5" aria-hidden="true" />
              Delete folder
            </button>
            <button
              type="button"
              className="btn btn-quiet press mt-2 mb-2 w-full"
              onClick={() => setDialog({ kind: "none" })}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {undo ? (
        <UndoBanner
          lift={lift}
          message="Photo deleted"
          onUndo={() => {
            const deleted = undo;
            setUndo(null);
            void run(() => restoreSnap(deleted));
          }}
        />
      ) : null}

      {banner ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <p className="pointer-events-auto max-w-lg rounded-md border border-border bg-surface px-4 py-3 text-sm text-danger">
            {banner}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function HomeScreen({
  folders,
  snaps,
  query,
  onQuery,
  latestIn,
  onOpenFolder,
  onOpenSnap,
  onCreate,
  onSnap,
}: {
  folders: Folder[];
  snaps: Snap[];
  query: string;
  onQuery: (value: string) => void;
  latestIn: (folderId: string) => Snap | undefined;
  onOpenFolder: (id: string) => void;
  onOpenSnap: (id: string) => void;
  onCreate: () => void;
  onSnap: () => void;
}) {
  const q = query.trim().toLowerCase();
  const folderHits = q ? folders.filter((folder) => folder.name.toLowerCase().includes(q)) : folders;
  const noteHits = q
    ? snaps
        .filter((snap) => snap.note.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt - a.createdAt)
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top px-5 pt-6">
        <p className="text-xs uppercase tracking-widest text-muted">On the go</p>
        <h1 className="font-display text-4xl">Snapnote</h1>
        <p className="mt-1 text-sm text-muted">A photo, and why it matters. Saved on this phone.</p>
      </header>

      <div className="px-5 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            className="field pr-11 pl-10"
            value={query}
            placeholder="Search notes and folders"
            aria-label="Search notes and folders"
            onChange={(event) => onQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
              aria-label="Clear search"
              onClick={() => onQuery("")}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 px-5 pt-2 pb-4">
        {folders.length === 0 && !q ? (
          <div className="px-2 pt-16 text-center">
            <EmptyMark />
            <h2 className="mt-4 font-display text-3xl">Nothing filed yet</h2>
            <p className="mx-auto mt-2 max-w-xs text-muted">
              Snap the price tag. Say why it matters. The camera roll won't remember for you.
            </p>
          </div>
        ) : null}

        {q && folderHits.length === 0 && noteHits.length === 0 ? (
          <p className="pt-10 text-center text-muted">Nothing matches “{query.trim()}”.</p>
        ) : null}

        {q && noteHits.length > 0 ? (
          <section className="pt-4">
            <h2 className="text-xs uppercase tracking-widest text-faint">Notes</h2>
            <ul className="mt-2">
              {noteHits.map((snap) => {
                const folder = folders.find((item) => item.id === snap.folderId);
                return (
                  <li key={snap.id} className="border-b border-border">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 py-3 text-left"
                      onClick={() => onOpenSnap(snap.id)}
                    >
                      <Photo
                        id={snap.id}
                        kind="thumb"
                        alt=""
                        className="size-14 shrink-0 rounded-sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block">{snap.note || "No note"}</span>
                        <span className="mt-1 block text-sm text-muted">
                          {folder?.name ?? "Folder"} · {formatWhen(snap.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {folderHits.length > 0 ? (
          <section className={q ? "pt-5" : "pt-2"}>
            {q ? <h2 className="text-xs uppercase tracking-widest text-faint">Folders</h2> : null}
            <ul>
              {folderHits.map((folder) => {
                const latest = latestIn(folder.id);
                const count = snaps.filter((snap) => snap.folderId === folder.id).length;
                return (
                  <li key={folder.id} className="border-b border-border">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 py-3 text-left"
                      onClick={() => onOpenFolder(folder.id)}
                    >
                      {latest ? (
                        <Photo id={latest.id} kind="thumb" alt="" className="size-16 shrink-0 rounded-md" />
                      ) : (
                        <span className="grid size-16 shrink-0 place-items-center rounded-md bg-surface-2 text-faint">
                          <FolderPlus className="size-5" aria-hidden="true" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium">{folder.name}</span>
                        <span className="block text-sm text-muted">
                          {plural(count, "snap")} · {formatWhen(folder.updatedAt)}
                        </span>
                        {latest?.note ? (
                          <span className="mt-0.5 line-clamp-1 block text-sm text-faint">{latest.note}</span>
                        ) : null}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-faint" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="safe-bottom sticky bottom-0 border-t border-border bg-surface px-6 pt-3">
        <div className="flex items-center justify-between pb-2">
          <button type="button" className="press flex min-h-11 min-w-16 flex-col items-center text-muted" onClick={onCreate}>
            <FolderPlus className="size-5" aria-hidden="true" />
            <span className="text-xs">Folder</span>
          </button>
          <button
            type="button"
            className="press grid size-16 -translate-y-5 place-items-center rounded-full bg-primary text-primary-ink ring-4 ring-surface"
            aria-label="Take a photo"
            onClick={onSnap}
          >
            <span className="size-12 rounded-full border-2 border-primary-ink/30" />
          </button>
          <span className="min-w-16" aria-hidden="true" />
        </div>
      </footer>
    </div>
  );
}

function FolderScreen({
  folder,
  photos,
  onBack,
  onOpen,
  onMenu,
  onSnap,
}: {
  folder: Folder;
  photos: Snap[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onMenu: () => void;
  onSnap: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top flex items-center gap-1 px-2 pt-2">
        <button type="button" className="press grid size-11 place-items-center" aria-label="Back" onClick={onBack}>
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-3xl">{folder.name}</h1>
        <button
          type="button"
          className="press grid size-11 place-items-center"
          aria-label="Folder actions"
          onClick={onMenu}
        >
          <MoreHorizontal className="size-6" />
        </button>
      </header>
      <p className="px-5 text-center text-sm text-muted">{plural(photos.length, "snap")}</p>

      {photos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <EmptyMark />
          <p className="mt-4 text-muted">Nothing in {folder.name} yet. Snap one and say why.</p>
        </div>
      ) : (
        <ul className="grid flex-1 grid-cols-2 content-start gap-3 px-4 pt-4 pb-6">
          {photos.map((snap) => (
            <li key={snap.id}>
              <button type="button" className="w-full text-left" onClick={() => onOpen(snap.id)}>
                <Photo
                  id={snap.id}
                  kind="thumb"
                  alt={snap.note || "Snap without a note"}
                  className="aspect-square w-full rounded-md bg-surface"
                />
                <span className="mt-1 line-clamp-2 block text-sm text-muted">
                  {snap.note || "No note yet"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="safe-bottom sticky bottom-0 border-t border-border bg-surface px-6 pt-3">
        <div className="flex items-center justify-center pb-2">
          <button
            type="button"
            className="press grid size-16 -translate-y-5 place-items-center rounded-full bg-primary text-primary-ink ring-4 ring-surface"
            aria-label={`Take a photo for ${folder.name}`}
            onClick={onSnap}
          >
            <span className="size-12 rounded-full border-2 border-primary-ink/30" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function DetailScreen({
  snap,
  folders,
  onBack,
  onDelete,
}: {
  snap: Snap;
  folders: Folder[];
  onBack: () => void;
  onDelete: () => void;
}) {
  const updateNote = useSnapStore((s) => s.updateNote);
  const moveSnap = useSnapStore((s) => s.moveSnap);
  const [note, setNote] = useState(snap.note);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const noteRef = useRef(note);
  const snapRef = useRef(snap);
  noteRef.current = note;
  snapRef.current = snap;
  const dictation = useDictation((spoken) => {
    setNote((prev) => appendNote(prev, spoken));
    setSaved(false);
  });

  useEffect(() => {
    setNote(snap.note);
    setSaved(false);
  }, [snap.id]);

  useEffect(() => {
    if (note === snap.note) return;
    const timer = window.setTimeout(() => {
      void updateNote(snap.id, note)
        .then(() => setSaved(true))
        .catch((err: unknown) => setError(storageMessage(err)));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [note, snap.id, snap.note, updateNote]);

  useEffect(() => {
    return () => {
      const current = snapRef.current;
      if (noteRef.current !== current.note) {
        void updateNote(current.id, noteRef.current);
      }
    };
  }, [updateNote]);

  const when = new Date(snap.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top flex items-center gap-1 px-2 pt-2">
        <button type="button" className="press grid size-11 place-items-center" aria-label="Back" onClick={onBack}>
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-2xl">{when}</h1>
        <button
          type="button"
          className="press grid size-11 place-items-center text-danger"
          aria-label="Delete photo"
          onClick={onDelete}
        >
          <Trash2 className="size-5" />
        </button>
      </header>

      <div className="mx-4 mt-1 h-72 overflow-hidden rounded-lg bg-surface">
        <Photo
          id={snap.id}
          kind="full"
          alt={note || "Saved snap"}
          fit="contain"
          className="h-full w-full"
        />
      </div>

      <div className="mx-4 mt-3 flex min-h-28 flex-1 flex-col">
        <textarea
          id="detail-note"
          value={note}
          maxLength={2000}
          placeholder="Why did you take this?"
          aria-label="Note"
          className="min-h-28 w-full flex-1 resize-none bg-transparent text-lg text-fg outline-none"
          onChange={(event) => {
            setNote(event.target.value);
            setSaved(false);
          }}
        />
      </div>
      <p className="min-h-6 px-4 text-sm text-primary" aria-live="polite">
        {dictation.listening
          ? dictation.interim || "Listening…"
          : dictation.error || error || (saved ? "Saved" : "")}
      </p>

      <div className="px-4">
        <button
          type="button"
          className={`btn press w-full ${dictation.listening ? "btn-primary mic-live" : "btn-quiet"}`}
          aria-label={dictation.listening ? "Stop dictation" : "Dictate a note"}
          onClick={dictation.toggle}
        >
          <Mic className="size-5" aria-hidden="true" />
          {dictation.listening ? "Tap to stop" : "Dictate"}
        </button>
      </div>

      <div className="safe-bottom mt-4 px-4">
        <p className="text-xs uppercase tracking-widest text-faint">Filed in</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {folders.map((folder) => {
            const on = folder.id === snap.folderId;
            return (
              <button
                key={folder.id}
                type="button"
                className={`press min-h-11 shrink-0 rounded-full px-4 ${on ? "bg-primary text-primary-ink" : "bg-surface-2"}`}
                onClick={() => {
                  if (!on) void moveSnap(snap.id, folder.id).catch((err: unknown) => setError(storageMessage(err)));
                }}
              >
                {folder.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
