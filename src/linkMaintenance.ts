import { Notice, TFile, type App, type Plugin } from "obsidian";

import {
  repairBrokenMediaLinksInContent,
  updateRenamedMediaLinksInContent,
  type LinkMaintenanceResult,
} from "./linkMaintenanceCore";

const MEDIA_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "m4v",
  "mov",
  "mp4",
  "png",
  "svg",
  "webm",
  "webp",
]);

interface VaultLinkMaintenanceResult extends LinkMaintenanceResult {
  updatedFileCount: number;
}

export function registerMediaLinkMaintenance(plugin: Plugin): void {
  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile) || !isSupportedMediaPath(oldPath) || oldPath === file.path) {
        return;
      }

      void updateRenamedMediaLinksInVault(plugin.app, oldPath, file.path).then((result) => {
        if (result.updatedItemCount > 0) {
          new Notice(
            `Visual Media Layout: updated ${result.updatedItemCount} media link(s) after file rename or move.`,
          );
        }
      });
    }),
  );

  plugin.addCommand({
    id: "repair-broken-media-layout-links",
    name: "Repair broken media layout links",
    callback: () => {
      void repairBrokenMediaLinksInVault(plugin.app).then((result) => {
        new Notice(
          [
            `Visual Media Layout: repaired ${result.updatedItemCount} broken media link(s).`,
            `${result.ambiguousItemCount} ambiguous, ${result.unresolvedItemCount} unresolved.`,
          ].join(" "),
        );
      });
    },
  });
}

export async function updateRenamedMediaLinksInVault(
  app: App,
  oldPath: string,
  newPath: string,
): Promise<VaultLinkMaintenanceResult> {
  return updateMarkdownFiles(app, (content) => updateRenamedMediaLinksInContent(content, oldPath, newPath));
}

export async function repairBrokenMediaLinksInVault(app: App): Promise<VaultLinkMaintenanceResult> {
  const mediaPathIndex = buildMediaPathIndex(app);

  return updateMarkdownFiles(app, (content, sourcePath) => repairBrokenMediaLinksInContent(content, {
    findCandidatePaths: (src) => mediaPathIndex.get(getPathBasename(src)) ?? [],
    resolveExistingPath: (src) => app.metadataCache.getFirstLinkpathDest(src, sourcePath)?.path ?? null,
  }));
}

async function updateMarkdownFiles(
  app: App,
  updateContent: (content: string, sourcePath: string) => LinkMaintenanceResult,
): Promise<VaultLinkMaintenanceResult> {
  const result: VaultLinkMaintenanceResult = {
    content: "",
    updatedLayoutCount: 0,
    updatedItemCount: 0,
    ambiguousItemCount: 0,
    unresolvedItemCount: 0,
    updatedFileCount: 0,
  };

  for (const file of app.vault.getMarkdownFiles()) {
    const content = await app.vault.read(file);
    const fileResult = updateContent(content, file.path);
    result.updatedLayoutCount += fileResult.updatedLayoutCount;
    result.updatedItemCount += fileResult.updatedItemCount;
    result.ambiguousItemCount += fileResult.ambiguousItemCount;
    result.unresolvedItemCount += fileResult.unresolvedItemCount;

    if (fileResult.content !== content) {
      await app.vault.modify(file, fileResult.content);
      result.updatedFileCount += 1;
    }
  }

  return result;
}

function buildMediaPathIndex(app: App): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const file of app.vault.getFiles()) {
    if (!isSupportedMediaPath(file.path)) {
      continue;
    }

    const basename = getPathBasename(file.path);
    const paths = index.get(basename) ?? [];
    paths.push(file.path);
    index.set(basename, paths);
  }

  return index;
}

function isSupportedMediaPath(path: string): boolean {
  const extension = getExtension(path);
  return MEDIA_EXTENSIONS.has(extension);
}

function getExtension(path: string): string {
  const cleanPath = path.split(/[?#]/)[0] ?? path;
  const basename = getPathBasename(cleanPath);
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex >= 0 ? basename.slice(dotIndex + 1).toLowerCase() : "";
}

function getPathBasename(path: string): string {
  const cleanPath = path.replace(/\\/g, "/").split(/[?#]/)[0] ?? path;
  return cleanPath.split("/").filter(Boolean).pop() ?? cleanPath;
}
