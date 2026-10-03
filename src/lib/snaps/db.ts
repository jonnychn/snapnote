import { getSupabase } from "@/lib/supabase";

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

const BUCKET = "snap-photos";

type FolderRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type SnapRow = {
  id: string;
  folder_id: string;
  note: string;
  created_at: string;
  updated_at: string;
};

function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

function toSnap(row: SnapRow): Snap {
  return {
    id: row.id,
    folderId: row.folder_id,
    note: row.note,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

async function requireUserId() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw new Error(error.message);
  const id = data.session?.user.id;
  if (!id) throw new Error("Sign in to save notes.");
  return id;
}

function fail(error: { message: string; code?: string } | null, fallback: string) {
  if (!error) return;
  const message = error.message || fallback;
  if (
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    /bucket not found/i.test(message)
  ) {
    throw new Error(
      "Snap Notes can't see its tables in your Supabase project yet. Run the setup SQL once, then try again.",
    );
  }
  throw new Error(message);
}

export async function loadAll(): Promise<{ folders: Folder[]; snaps: Snap[] }> {
  const supabase = getSupabase();
  const [foldersRes, snapsRes] = await Promise.all([
    supabase.from("folders").select("id,name,created_at,updated_at"),
    supabase.from("snaps").select("id,folder_id,note,created_at,updated_at"),
  ]);
  fail(foldersRes.error, "Could not read your notes.");
  fail(snapsRes.error, "Could not read your notes.");
  return {
    folders: ((foldersRes.data ?? []) as FolderRow[]).map(toFolder),
    snaps: ((snapsRes.data ?? []) as SnapRow[]).map(toSnap),
  };
}

export async function putFolder(folder: Folder): Promise<void> {
  const userId = await requireUserId();
  const { error } = await getSupabase().from("folders").upsert({
    id: folder.id,
    user_id: userId,
    name: folder.name,
    created_at: new Date(folder.createdAt).toISOString(),
    updated_at: new Date(folder.updatedAt).toISOString(),
  });
  fail(error, "Could not save that folder.");
}

export async function putSnap(snap: Snap, media: Media): Promise<void> {
  const userId = await requireUserId();
  const supabase = getSupabase();
  const fullPath = `${userId}/${snap.id}/full.jpg`;
  const thumbPath = `${userId}/${snap.id}/thumb.jpg`;
  const [fullUp, thumbUp] = await Promise.all([
    supabase.storage.from(BUCKET).upload(fullPath, media.full, {
      contentType: "image/jpeg",
      upsert: true,
    }),
    supabase.storage.from(BUCKET).upload(thumbPath, media.thumb, {
      contentType: "image/jpeg",
      upsert: true,
    }),
  ]);
  fail(fullUp.error, "Could not save that photo.");
  fail(thumbUp.error, "Could not save that photo.");
  const { error } = await supabase.from("snaps").upsert({
    id: snap.id,
    user_id: userId,
    folder_id: snap.folderId,
    note: snap.note,
    created_at: new Date(snap.createdAt).toISOString(),
    updated_at: new Date(snap.updatedAt).toISOString(),
  });
  fail(error, "Could not save that photo.");
  const folderUpdate = await supabase
    .from("folders")
    .update({ updated_at: new Date(snap.updatedAt).toISOString() })
    .eq("id", snap.folderId);
  fail(folderUpdate.error, "Could not save that photo.");
}

export async function patchSnap(snap: Snap): Promise<void> {
  const { error } = await getSupabase()
    .from("snaps")
    .update({
      folder_id: snap.folderId,
      note: snap.note,
      updated_at: new Date(snap.updatedAt).toISOString(),
    })
    .eq("id", snap.id);
  fail(error, "Could not save that note.");
}

export async function removeSnapRecord(id: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = getSupabase();
  const removed = await supabase.storage.from(BUCKET).remove([`${userId}/${id}/full.jpg`, `${userId}/${id}/thumb.jpg`]);
  fail(removed.error, "Could not delete that photo.");
  const { error } = await supabase.from("snaps").delete().eq("id", id);
  fail(error, "Could not delete that photo.");
}

export async function removeFolderRecord(id: string): Promise<string[]> {
  const userId = await requireUserId();
  const supabase = getSupabase();
  const listed = await supabase.from("snaps").select("id").eq("folder_id", id);
  fail(listed.error, "Could not delete that folder.");
  const ids = ((listed.data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length > 0) {
    const paths = ids.flatMap((snapId) => [`${userId}/${snapId}/full.jpg`, `${userId}/${snapId}/thumb.jpg`]);
    const removed = await supabase.storage.from(BUCKET).remove(paths);
    fail(removed.error, "Could not delete that folder.");
  }
  const { error } = await supabase.from("folders").delete().eq("id", id);
  fail(error, "Could not delete that folder.");
  return ids;
}

export async function readMedia(id: string): Promise<Media | undefined> {
  const userId = await requireUserId();
  const supabase = getSupabase();
  const [full, thumb] = await Promise.all([
    supabase.storage.from(BUCKET).download(`${userId}/${id}/full.jpg`),
    supabase.storage.from(BUCKET).download(`${userId}/${id}/thumb.jpg`),
  ]);
  if (full.error || thumb.error || !full.data || !thumb.data) return undefined;
  return { id, full: full.data, thumb: thumb.data };
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

export function dropAllMediaUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
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
