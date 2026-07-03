const DB_NAME = 'alphonso-offline';
const DB_VERSION = 1;
const STORE_NAME = 'chat-messages';

interface OfflineMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: number;
  synced: boolean;
}

export interface OfflineMessageInput {
  id?: string;
  conversationId?: string;
  role?: string;
  content?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('conversationId', 'conversationId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMessageOffline(message: OfflineMessageInput): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id: message.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      conversationId: message.conversationId || 'default',
      role: message.role || 'user',
      content: message.content || '',
      timestamp: Date.now(),
      synced: false
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineMessages(conversationId?: string): Promise<OfflineMessage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('conversationId');
    const range = IDBKeyRange.only(conversationId || 'default');
    const messages: OfflineMessage[] = [];
    index.openCursor(range).onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        messages.push(cursor.value);
        cursor.continue();
      } else {
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function markSynced(messageId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(messageId);
    getReq.onsuccess = () => {
      const msg = getReq.result as OfflineMessage | undefined;
      if (msg) {
        msg.synced = true;
        store.put(msg);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingSyncMessages(): Promise<OfflineMessage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const messages: OfflineMessage[] = [];
    tx.objectStore(STORE_NAME).openCursor().onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (!cursor.value.synced) messages.push(cursor.value);
        cursor.continue();
      } else {
        resolve(messages);
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearOfflineMessages(conversationId?: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('conversationId');
    const range = IDBKeyRange.only(conversationId || 'default');
    index.openCursor(range).onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    tx.onerror = () => reject(tx.error);
  });
}
