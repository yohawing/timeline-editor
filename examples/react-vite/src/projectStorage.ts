import type { Document } from "./audioDemo";

export interface SavedProject {
  version: 1;
  document: Document;
  audio: [string, Blob][];
}

function validProject(value: SavedProject): boolean {
  if (value.version !== 1 || !Array.isArray(value.document?.tracks) || !Array.isArray(value.document?.clips) || !Array.isArray(value.audio)) return false;
  const { tracks, clips } = value.document;
  if (!tracks.every(track => track && typeof track.id === "string" && ["group", "audio", "animation", "event"].includes(track.type))) return false;
  for (const track of tracks) {
    const visited = new Set<string>([track.id]);
    let parent = track.parentId;
    while (parent) {
      if (visited.has(parent)) return false;
      visited.add(parent);
      const group = tracks.find(item => item.id === parent);
      if (!group || group.type !== "group") return false;
      parent = group.parentId;
    }
  }
  const range = value.document.playbackRange;
  if (range && (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)) return false;
  if (new Set(tracks.map(track => track.id)).size !== tracks.length || new Set(clips.map(clip => clip?.id)).size !== clips.length) return false;
  if (!clips.every(clip => clip && clip.kind === "clip" && typeof clip.id === "string" && typeof clip.label === "string" && tracks.some(track => track.id === clip.rowId)
    && Number.isFinite(clip.range?.start) && Number.isFinite(clip.range?.end) && clip.range.end > clip.range.start
    && (clip.sourceOffset === undefined || (Number.isFinite(clip.sourceOffset) && clip.sourceOffset >= 0))
    && (clip.sourceDuration === undefined || (Number.isFinite(clip.sourceDuration) && clip.sourceDuration > 0))
    && (clip.waveform === undefined || (Array.isArray(clip.waveform) && clip.waveform.every(Number.isFinite))))) return false;
  if (!value.audio.every(entry => Array.isArray(entry) && typeof entry[0] === "string" && entry[1] instanceof Blob)) return false;
  const audioIds = new Set(value.audio.map(([id]) => id));
  const audioClips = clips.filter(clip => tracks.find(track => track.id === clip.rowId)?.type === "audio");
  return audioIds.size === value.audio.length && audioIds.size === audioClips.length && audioClips.every(clip => audioIds.has(clip.id));
}

// One transaction stores the document and its original audio together. A failed
// write leaves the previous project intact, never a partially saved document.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("timeline-editor.demo", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error("Project storage is blocked by another tab.")); };
  });
}

export async function readProject(key: string): Promise<SavedProject | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get(key);
      transaction.oncomplete = () => {
        const value = request.result as SavedProject | undefined;
        if (value !== undefined && (!value || !validProject(value))) {
          reject(new Error("Unsupported saved project."));
        } else resolve(value);
      };
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function writeProject(key: string, value: SavedProject, isCurrent = () => true): Promise<void> {
  const db = await database();
  try {
    // A previous component session may have ended while opening the database.
    if (!isCurrent()) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("projects", "readwrite");
      transaction.objectStore("projects").put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
