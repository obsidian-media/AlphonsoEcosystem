export function getStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
