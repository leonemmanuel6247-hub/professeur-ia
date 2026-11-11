import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function readTextFile(uri: string): Promise<string> {
  if (isWeb) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error("Lecture du fichier impossible.");
    return res.text();
  }
  return FileSystem.readAsStringAsync(uri);
}

export async function saveAndShare(
  filename: string,
  content: string,
  mimeType: string
): Promise<string> {
  if (isWeb) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  }
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error("Stockage local indisponible.");
  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, content);
  const Sharing = await import("expo-sharing");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType, dialogTitle: filename });
  }
  return path;
}
