import { useEffect, useState } from "react";

export function usePersistentState(key: string, defaultValue: string) {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    const stored = window.localStorage.getItem(key);
    return stored ?? defaultValue;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
