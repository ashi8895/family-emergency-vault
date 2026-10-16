/** localStorage can throw (private mode, blocked cookies). Preferences are a convenience, so failures are ignored. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the choice just will not persist */
  }
}
