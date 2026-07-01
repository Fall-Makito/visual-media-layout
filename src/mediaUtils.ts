import { TFile, type App } from "obsidian";

export function getMediaResourceUrl(app: App, src: string, sourcePath: string): string | null {
  if (isRemoteUrl(src)) {
    return src;
  }

  const file = getMediaFile(app, src, sourcePath);
  return file ? app.vault.getResourcePath(file) : null;
}

export function getMediaFile(app: App, src: string, sourcePath: string): TFile | null {
  if (isRemoteUrl(src)) {
    return null;
  }

  const file = app.metadataCache.getFirstLinkpathDest(src, sourcePath);
  return file instanceof TFile ? file : null;
}

export function getMediaDisplayName(src: string): string {
  const cleanSrc = src.split(/[?#]/)[0] ?? src;
  return cleanSrc.split("/").filter(Boolean).pop() ?? src;
}

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
