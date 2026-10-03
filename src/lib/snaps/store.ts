import { create } from "zustand";
import {
  dropAllMediaUrls,
  dropMediaUrls,
  loadAll,
  makeImages,
  putFolder,
  putSnap,
  patchSnap,
  removeFolderRecord,
  removeSnapRecord,
  readMedia,
  storageMessage,
  type Folder,
  type Media,
  type Snap,
} from "./db";

export type DeletedSnap = {
  snap: Snap;
  media: Media;
};

type SnapState = {
  status: "loading" | "ready" | "error";
  error: string;
  folders: Folder[];
  snaps: Snap[];
  init: () => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  saveSnap: (input: { folderId: string; source: Blob; note: string }) => Promise<Snap>;
  updateNote: (id: string, note: string) => Promise<void>;
  moveSnap: (id: string, folderId: string) => Promise<void>;
  deleteSnap: (id: string) => Promise<DeletedSnap | null>;
  restoreSnap: (deleted: DeletedSnap) => Promise<void>;
};

let initStarted = false;
let initGen = 0;

export function resetSnapSession() {
  initGen += 1;
  initStarted = false;
  dropAllMediaUrls();
  useSnapStore.setState({
    status: "loading",
    error: "",
    folders: [],
    snaps: [],
  });
}

function cleanName(name: string) {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("Give the folder a name.");
  return trimmed.slice(0, 40);
}

export const useSnapStore = create<SnapState>((set, get) => ({
  status: "loading",
  error: "",
  folders: [],
  snaps: [],

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    const gen = initGen;
    try {
      const data = await loadAll();
      if (gen !== initGen) return;
      set({ ...data, status: "ready", error: "" });
    } catch (error) {
      if (gen !== initGen) return;
      initStarted = false;
      set({ status: "error", error: storageMessage(error) });
    }
  },

  createFolder: async (name) => {
    const now = Date.now();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: cleanName(name),
      createdAt: now,
      updatedAt: now,
    };
    await putFolder(folder);
    set({ folders: [...get().folders, folder] });
    return folder;
  },

  renameFolder: async (id, name) => {
    const folder = get().folders.find((item) => item.id === id);
    if (!folder) return;
    const next: Folder = { ...folder, name: cleanName(name), updatedAt: Date.now() };
    await putFolder(next);
    set({
      folders: get().folders.map((item) => (item.id === id ? next : item)),
    });
  },

  deleteFolder: async (id) => {
    const removed = await removeFolderRecord(id);
    for (const snapId of removed) dropMediaUrls(snapId);
    set({
      folders: get().folders.filter((item) => item.id !== id),
      snaps: get().snaps.filter((item) => item.folderId !== id),
    });
  },

  saveSnap: async ({ folderId, source, note }) => {
    const now = Date.now();
    const images = await makeImages(source);
    const snap: Snap = {
      id: crypto.randomUUID(),
      folderId,
      note: note.trim().slice(0, 2000),
      createdAt: now,
      updatedAt: now,
    };
    await putSnap(snap, { id: snap.id, ...images });
    set({
      snaps: [...get().snaps, snap],
      folders: get().folders.map((folder) =>
        folder.id === folderId ? { ...folder, updatedAt: now } : folder,
      ),
    });
    return snap;
  },

  updateNote: async (id, note) => {
    const snap = get().snaps.find((item) => item.id === id);
    if (!snap) return;
    const next: Snap = { ...snap, note: note.slice(0, 2000), updatedAt: Date.now() };
    await patchSnap(next);
    set({ snaps: get().snaps.map((item) => (item.id === id ? next : item)) });
  },

  moveSnap: async (id, folderId) => {
    const snap = get().snaps.find((item) => item.id === id);
    if (!snap || snap.folderId === folderId) return;
    const now = Date.now();
    const next: Snap = { ...snap, folderId, updatedAt: now };
    await patchSnap(next);
    set({
      snaps: get().snaps.map((item) => (item.id === id ? next : item)),
      folders: get().folders.map((folder) =>
        folder.id === folderId ? { ...folder, updatedAt: now } : folder,
      ),
    });
  },

  deleteSnap: async (id) => {
    const snap = get().snaps.find((item) => item.id === id);
    if (!snap) return null;
    const media = await readMedia(id);
    await removeSnapRecord(id);
    dropMediaUrls(id);
    set({ snaps: get().snaps.filter((item) => item.id !== id) });
    if (!media) return null;
    return { snap, media };
  },

  restoreSnap: async ({ snap, media }) => {
    await putSnap(snap, media);
    const exists = get().snaps.some((item) => item.id === snap.id);
    set({
      snaps: exists ? get().snaps : [...get().snaps, snap],
      folders: get().folders.map((folder) =>
        folder.id === snap.folderId ? { ...folder, updatedAt: Date.now() } : folder,
      ),
    });
  },
}));
