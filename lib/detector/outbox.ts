export type PendingObservation = { id: string; imageDataUrl: string; capturedAt: string; suggestion: unknown; [key: string]: unknown };
async function openOutbox() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("whatspulled-detector-outbox", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("frames", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openOutbox();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("frames", mode);
      const request = run(transaction.objectStore("frames"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const savePendingFrame = (frame: PendingObservation) => operation("readwrite", store => store.put(frame));
export const loadPendingFrames = () => operation<PendingObservation[]>("readonly", store => store.getAll());
export const removePendingFrame = (id: string) => operation("readwrite", store => store.delete(id));
