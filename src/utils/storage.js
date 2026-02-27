/**
 * Persistent storage — IndexedDB for binary data, localStorage for metadata.
 */

const DB_NAME = 'PDFReaderPro';
const DB_VERSION = 2;
const FILE_STORE = 'files';
const THUMB_STORE = 'thumbnails';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(THUMB_STORE)) {
        db.createObjectStore(THUMB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveFile(id, arrayBuffer, meta) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).put({ id, data: arrayBuffer, ...meta });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const req = tx.objectStore(FILE_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readwrite');
    tx.objectStore(FILE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveThumbnail(id, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(THUMB_STORE, 'readwrite');
    tx.objectStore(THUMB_STORE).put({ id, dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadThumbnail(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(THUMB_STORE, 'readonly');
    const req = tx.objectStore(THUMB_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.dataUrl || null);
    req.onerror = () => reject(req.error);
  });
}

// --- Metadata via localStorage ---

export function getDocuments() {
  try {
    return JSON.parse(localStorage.getItem('pdf_documents') || '[]');
  } catch {
    return [];
  }
}

export function saveDocuments(docs) {
  localStorage.setItem('pdf_documents', JSON.stringify(docs));
}

export function getBookmarks(docId) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_bookmarks') || '{}');
    return all[docId] || [];
  } catch {
    return [];
  }
}

export function saveBookmarks(docId, bookmarks) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_bookmarks') || '{}');
    all[docId] = bookmarks;
    localStorage.setItem('pdf_bookmarks', JSON.stringify(all));
  } catch { /* quota exceeded, fail silently */ }
}

export function getAnnotations(docId) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_annotations') || '{}');
    return all[docId] || [];
  } catch {
    return [];
  }
}

export function saveAnnotations(docId, annotations) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_annotations') || '{}');
    all[docId] = annotations;
    localStorage.setItem('pdf_annotations', JSON.stringify(all));
  } catch { /* quota exceeded */ }
}

export function getReadingPosition(docId) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_positions') || '{}');
    return all[docId] || null;
  } catch {
    return null;
  }
}

export function saveReadingPosition(docId, position) {
  try {
    const all = JSON.parse(localStorage.getItem('pdf_positions') || '{}');
    all[docId] = position;
    localStorage.setItem('pdf_positions', JSON.stringify(all));
  } catch { /* quota exceeded */ }
}
