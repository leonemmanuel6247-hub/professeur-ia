import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY_PREFIX = "pia_key_";

const webStore = {
  get(k: string): string {
    try {
      return globalThis.localStorage?.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set(k: string, v: string) {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del(k: string) {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const isWeb = Platform.OS === "web";

export async function saveApiKey(profileId: string, key: string) {
  if (isWeb) {
    webStore.set(KEY_PREFIX + profileId, key);
    return;
  }
  await SecureStore.setItemAsync(KEY_PREFIX + profileId, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getApiKey(profileId: string): Promise<string> {
  if (isWeb) return webStore.get(KEY_PREFIX + profileId);
  try {
    return (await SecureStore.getItemAsync(KEY_PREFIX + profileId)) ?? "";
  } catch {
    return "";
  }
}

export async function deleteApiKey(profileId: string) {
  if (isWeb) {
    webStore.del(KEY_PREFIX + profileId);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEY_PREFIX + profileId);
  } catch {
    /* ignore */
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}