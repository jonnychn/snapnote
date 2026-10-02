export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Snap = {
  id: string;
  folderId: string;
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type Media = {
  id: string;
  full: Blob;
  thumb: Blob;
};

const DB_NAME = "snapnote";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Storage isn't available in this browser."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("folders")) {
          db.createObjectStore("folders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("snaps")) {
          const snaps = db.createObjectStore("snaps", { keyPath: "id" });
          snaps.createIndex("byFolder", "folderId");
        }
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("Could not open storage."));
      };
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<{ folders: Folder[]; snaps: Snap[] }> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["folders", "snaps"], "readonly");
    const foldersReq = tx.objectStore("folders").getAll();
    const snapsReq = tx.objectStore("snaps").getAll();
    tx.oncomplete = () =>
      resolve({
        folders: foldersReq.result as Folder[],
        snaps: snapsReq.result as Snap[],
      });
    tx.onerror = () => reject(tx.error ?? new Error("Could not read your notes."));
  });
}

export async function putFolder(folder: Folder): Promise<void> {
  const db = await openDb();
  await write("folders", folder, db);
}

export async function putSnap(snap: Snap, media: Media): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["snaps", "media", "folders"], "readwrite");
    tx.objectStore("snaps").put(snap);
    tx.objectStore("media").put(media);
    const folderReq = tx.objectStore("folders").get(snap.folderId);
    folderReq.onsuccess = () => {
      const folder = folderReq.result as Folder | undefined;
      if (folder) {
        tx.objectStore("folders").put({ ...folder, updatedAt: snap.updatedAt });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save that photo."));
    tx.onabort = () => reject(tx.error ?? new Error("Could not save that photo."));
  });
}

export async function patchSnap(snap: Snap): Promise<void> {
  const db = await openDb();
  await write("snaps", snap, db);
}

export async function removeSnapRecord(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["snaps", "media"], "readwrite");
    tx.objectStore("snaps").delete(id);
    tx.objectStore("media").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete that photo."));
  });
}

export async function removeFolderRecord(id: string): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["folders", "snaps", "media"], "readwrite");
    const index = tx.objectStore("snaps").index("byFolder");
    const req = index.getAll(id);
    req.onsuccess = () => {
      const rows = req.result as Snap[];
      for (const row of rows) {
        tx.objectStore("snaps").delete(row.id);
        tx.objectStore("media").delete(row.id);
      }
      tx.objectStore("folders").delete(id);
    };
    tx.oncomplete = () => resolve((req.result as Snap[] | undefined)?.map((row) => row.id) ?? []);
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete that folder."));
  });
}

export async function readMedia(id: string): Promise<Media | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readonly");
    const req = tx.objectStore("media").get(id);
    req.onsuccess = () => resolve(req.result as Media | undefined);
    req.onerror = () => reject(req.error ?? new Error("Could not open that photo."));
  });
}

function write(store: "folders" | "snaps", value: Folder | Snap, db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save."));
  });
}

export function storageMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "This phone is out of room for more photos. Delete a few and try again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong saving that.";
}

export async function makeImages(source: Blob): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await decodeImage(source);
  try {
    const full = await drawJpeg(bitmap, 1600, 0.82);
    const thumb = await drawJpeg(bitmap, 480, 0.72);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

async function decodeImage(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source);
  } catch {
    const url = URL.createObjectURL(source);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Couldn't read that photo. Try another one."));
        el.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function drawJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Couldn't prepare that photo."));
  ctx.fillStyle = "#16130f";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare that photo."))),
      "image/jpeg",
      quality,
    );
  });
}

const urlCache = new Map<string, string>();

export async function mediaUrl(id: string, kind: "thumb" | "full"): Promise<string> {
  const key = `${kind}:${id}`;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const media = await readMedia(id);
  if (!media) throw new Error("That photo is missing.");
  const url = URL.createObjectURL(kind === "thumb" ? media.thumb : media.full);
  urlCache.set(key, url);
  return url;
}

export function dropMediaUrls(id: string) {
  for (const kind of ["thumb", "full"] as const) {
    const key = `${kind}:${id}`;
    const url = urlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}

export function appendNote(prev: string, spoken: string) {
  const bit = spoken.replace(/\s+/g, " ").trim();
  if (!bit) return prev;
  const room = 2000 - prev.length;
  if (room <= 1) return prev;
  const clipped = bit.slice(0, room - 1);
  if (!prev) return clipped;
  const gap = /\s$/.test(prev) ? "" : " ";
  return (prev + gap + clipped).slice(0, 2000);
}
