export function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").trim().slice(0, 160) || "Untitled audio";
}

export function safeFilename(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}._ -]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(-100);
  return cleaned || "audio";
}
