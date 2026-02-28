import type { PDFDocument, Annotation, Bookmark } from '@/types';

const DB_NAME = 'pdf-reader-pro';
const DB_VERSION = 1;

const STORES = {
  documents: 'documents',
  files: 'files',
  annotations: 'annotations',
  bookmarks: 'bookmarks',
  thumbnails: 'thumbnails',
} as const;

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.documents)) {
        db.createObjectStore(STORES.documents, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.files)) {
        db.createObjectStore(STORES.files);
      }
      if (!db.objectStoreNames.contains(STORES.annotations)) {
        const store = db.createObjectStore(STORES.annotations, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        const store = db.createObjectStore(STORES.bookmarks, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.thumbnails)) {
        db.createObjectStore(STORES.thumbnails);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

async function tx(
  storeName: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Document operations
export async function getAllDocuments(): Promise<PDFDocument[]> {
  const store = await tx(STORES.documents);
  return promisify(store.getAll());
}

export async function getDocument(id: string): Promise<PDFDocument | undefined> {
  const store = await tx(STORES.documents);
  return promisify(store.get(id));
}

export async function saveDocument(doc: PDFDocument): Promise<void> {
  const store = await tx(STORES.documents, 'readwrite');
  await promisify(store.put(doc));
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(
    [STORES.documents, STORES.files, STORES.annotations, STORES.bookmarks, STORES.thumbnails],
    'readwrite'
  );
  transaction.objectStore(STORES.documents).delete(id);
  transaction.objectStore(STORES.files).delete(id);
  transaction.objectStore(STORES.thumbnails).delete(id);

  // Delete annotations and bookmarks by index
  const annStore = transaction.objectStore(STORES.annotations);
  const annIndex = annStore.index('documentId');
  const annCursor = annIndex.openCursor(IDBKeyRange.only(id));
  await new Promise<void>((resolve, reject) => {
    annCursor.onsuccess = () => {
      const cursor = annCursor.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    annCursor.onerror = () => reject(annCursor.error);
  });

  const bmStore = transaction.objectStore(STORES.bookmarks);
  const bmIndex = bmStore.index('documentId');
  const bmCursor = bmIndex.openCursor(IDBKeyRange.only(id));
  await new Promise<void>((resolve, reject) => {
    bmCursor.onsuccess = () => {
      const cursor = bmCursor.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    bmCursor.onerror = () => reject(bmCursor.error);
  });
}

// File operations (raw PDF data)
export async function saveFile(id: string, data: ArrayBuffer): Promise<void> {
  const store = await tx(STORES.files, 'readwrite');
  await promisify(store.put(data, id));
}

export async function getFile(id: string): Promise<ArrayBuffer | undefined> {
  const store = await tx(STORES.files);
  return promisify(store.get(id));
}

// Annotation operations
export async function getAnnotations(documentId: string): Promise<Annotation[]> {
  const store = await tx(STORES.annotations);
  const index = store.index('documentId');
  return promisify(index.getAll(IDBKeyRange.only(documentId)));
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const store = await tx(STORES.annotations, 'readwrite');
  await promisify(store.put(annotation));
}

export async function deleteAnnotation(id: string): Promise<void> {
  const store = await tx(STORES.annotations, 'readwrite');
  await promisify(store.delete(id));
}

// Bookmark operations
export async function getBookmarks(documentId: string): Promise<Bookmark[]> {
  const store = await tx(STORES.bookmarks);
  const index = store.index('documentId');
  return promisify(index.getAll(IDBKeyRange.only(documentId)));
}

export async function saveBookmark(bookmark: Bookmark): Promise<void> {
  const store = await tx(STORES.bookmarks, 'readwrite');
  await promisify(store.put(bookmark));
}

export async function deleteBookmark(id: string): Promise<void> {
  const store = await tx(STORES.bookmarks, 'readwrite');
  await promisify(store.delete(id));
}

// Thumbnail operations
export async function saveThumbnail(documentId: string, dataUrl: string): Promise<void> {
  const store = await tx(STORES.thumbnails, 'readwrite');
  await promisify(store.put(dataUrl, documentId));
}

export async function getThumbnail(documentId: string): Promise<string | undefined> {
  const store = await tx(STORES.thumbnails);
  return promisify(store.get(documentId));
}
