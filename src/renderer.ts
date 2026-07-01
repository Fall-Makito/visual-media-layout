import { Menu, Modal, Notice, TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import { deleteVisualMediaLayoutBlock, saveVisualMediaLayout, saveVisualMediaLayoutEdits } from "./editorWrites";
import { getMediaDisplayName, getMediaFile, getMediaResourceUrl } from "./mediaUtils";
import { parseVisualMediaLayout } from "./parser";
import type { CaptionAlign, MediaAlign, VisualMediaItem, VisualMediaLayout, VisualMediaRow } from "./types";

const MIN_MEDIA_SIZE = 80;
const MAX_MEDIA_HEIGHT = 900;
const DRAG_START_DISTANCE = 6;
const ROW_RESIZE_SENSITIVITY = 1.2;

type DropSide = "left" | "right";
type RowDropSide = "before" | "after";

type DropTarget = ItemDropTarget | RowDropTarget | LayoutDropTarget;

interface ItemDropTarget {
  type: "item";
  rootEl: HTMLElement;
  itemId: string;
  side: DropSide;
}

interface RowDropTarget {
  type: "row";
  rootEl: HTMLElement;
  rowId: string;
  side: RowDropSide;
}

interface LayoutDropTarget {
  type: "layout";
  rootEl: HTMLElement;
}

export interface RenderVisualMediaLayoutOptions {
  app: App;
  source: string;
  containerEl: HTMLElement;
  context: MarkdownPostProcessorContext;
}

interface RenderedLayoutState {
  layout: VisualMediaLayout;
  options: RenderVisualMediaLayoutOptions;
  root: HTMLElement;
}

interface FileExplorerView {
  revealInFolder?: (file: TFile) => void;
}

const renderedLayouts = new WeakMap<HTMLElement, RenderedLayoutState>();
const pendingContainedMediaUpdates = new WeakMap<HTMLElement, number>();

export function renderVisualMediaLayout(options: RenderVisualMediaLayoutOptions): void {
  const layout = parseVisualMediaLayout(options.source);
  const root = options.containerEl.createDiv({
    cls: "visual-media-layout",
    attr: {
      "data-source-path": options.context.sourcePath,
    },
  });
  if (isLikelyLivePreview(options.containerEl)) {
    root.classList.add("visual-media-layout--live-preview");
  }

  if (!layout) {
    root.createDiv({
      cls: "visual-media-layout__placeholder",
      text: "Visual Media Layout: this block is not valid JSON yet.",
    });
    return;
  }

  renderedLayouts.set(root, {
    layout,
    options,
    root,
  });
  if (layout.nativeFallback) {
    hideNativeFallback(root);
  }

  if (layout.rows.length === 0) {
    root.createDiv({
      cls: "visual-media-layout__empty",
      text: "Visual Media Layout: empty layout. Media rendering comes next.",
    });
    return;
  }

  renderLayoutRows(root, layout, options);
}

function renderLayoutRows(
  root: HTMLElement,
  layout: VisualMediaLayout,
  options: RenderVisualMediaLayoutOptions,
): void {
  root.replaceChildren();

  if (layout.rows.length === 0) {
    root.createDiv({
      cls: "visual-media-layout__empty",
      text: "Visual Media Layout: all media items were removed.",
    });
    return;
  }

  layout.rows.forEach((row, rowIndex) => {
    renderRow(root, layout, row, rowIndex, options);
  });
}

function renderRow(
  root: HTMLElement,
  layout: VisualMediaLayout,
  row: VisualMediaRow,
  rowIndex: number,
  options: RenderVisualMediaLayoutOptions,
): void {
  const columnCount = getColumnCount(row);
  const rowEl = root.createDiv({
    cls: "visual-media-layout__row",
    attr: {
      "data-row-id": row.id,
      "data-row-index": String(rowIndex),
      "data-align": row.align,
      "data-columns": String(columnCount),
    },
  });

  rowEl.style.setProperty("--visual-media-row-height", `${row.height}px`);
  rowEl.style.setProperty("--visual-media-columns", String(columnCount));

  if (row.items.length === 0) {
    rowEl.createDiv({
      cls: "visual-media-layout__empty-row",
      text: "This row has no media.",
    });
    return;
  }

  const gridEl = rowEl.createDiv({
    cls: row.items.length === 1
      ? "visual-media-layout__grid visual-media-layout__grid--single"
      : "visual-media-layout__grid",
  });
  gridEl.style.gridTemplateColumns = getGridTemplateColumns(row);
  row.items.forEach((item, itemIndex) => {
    renderItem(root, gridEl, layout, item, rowIndex, itemIndex, options, row.items.length);
  });
}

function renderItem(
  root: HTMLElement,
  gridEl: HTMLElement,
  layout: VisualMediaLayout,
  item: VisualMediaItem,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
  rowItemCount: number,
): void {
  const itemEl = gridEl.createDiv({
    cls: item.caption
      ? "visual-media-layout__item visual-media-layout__item--has-caption"
      : "visual-media-layout__item",
    attr: {
      "data-item-id": item.id,
      "data-item-index": String(itemIndex),
      "data-media-type": item.type,
      "data-fit": item.fit,
      "data-align": item.align,
      "draggable": "false",
      "tabindex": "0",
    },
  });

  itemEl.style.setProperty("--visual-media-item-width", `${item.width}px`);
  if (rowItemCount === 1) {
    itemEl.style.justifySelf = getSingleItemJustifySelf(item.align);
  }

  registerItemInteractions(root, itemEl, layout, rowIndex, itemIndex, options);
  renderResizeHandle(root, itemEl, layout, rowIndex, itemIndex, options, rowItemCount);
  renderColumnResizeHandle(root, gridEl, itemEl, layout, rowIndex, itemIndex, options, rowItemCount);

  const resourceUrl = getMediaResourceUrl(options.app, item.src, options.context.sourcePath);
  if (!resourceUrl) {
    renderMissingMedia(itemEl, item);
    renderCaption(itemEl, item);
    return;
  }

  const mediaFrameEl = itemEl.createDiv({ cls: "visual-media-layout__media-frame" });

  if (item.type === "image") {
    const imageEl = mediaFrameEl.createEl("img", {
      cls: "visual-media-layout__media",
      attr: {
        alt: item.alt || getMediaDisplayName(item.src),
        draggable: "false",
        src: resourceUrl,
      },
    });
    imageEl.style.objectFit = item.fit;
    initializeContainedMediaFrame(itemEl, mediaFrameEl, imageEl, item);
    imageEl.addEventListener("load", () => {
      storeMediaAspectRatio(itemEl, item, imageEl.naturalWidth, imageEl.naturalHeight);
      fitContainedMediaToFrame(itemEl, mediaFrameEl, imageEl, item, imageEl.naturalWidth, imageEl.naturalHeight);
      syncSingleMediaRowHeightFromRatio(
        itemEl,
        rowItemCount,
        imageEl.naturalWidth,
        imageEl.naturalHeight,
        layout,
        rowIndex,
        itemIndex,
      );
    });
    renderCaption(itemEl, item);
    return;
  }

  const videoEl = mediaFrameEl.createEl("video", {
    cls: "visual-media-layout__media",
    attr: {
      draggable: "false",
      src: resourceUrl,
    },
  });
  videoEl.controls = true;
  videoEl.preload = "metadata";
  videoEl.style.objectFit = item.fit;
  initializeContainedMediaFrame(itemEl, mediaFrameEl, videoEl, item);
  videoEl.addEventListener("loadedmetadata", () => {
    storeMediaAspectRatio(itemEl, item, videoEl.videoWidth, videoEl.videoHeight);
    fitContainedMediaToFrame(itemEl, mediaFrameEl, videoEl, item, videoEl.videoWidth, videoEl.videoHeight);
    syncSingleMediaRowHeightFromRatio(
      itemEl,
      rowItemCount,
      videoEl.videoWidth,
      videoEl.videoHeight,
      layout,
      rowIndex,
      itemIndex,
    );
  });

  renderCaption(itemEl, item);
}

function renderCaption(itemEl: HTMLElement, item: VisualMediaItem): void {
  if (!item.caption) {
    return;
  }

  itemEl.createDiv({
    cls: "visual-media-layout__caption",
    attr: {
      "data-caption-align": item.captionAlign ?? "left",
    },
    text: item.caption,
  });
}

function initializeContainedMediaFrame(
  itemEl: HTMLElement,
  mediaFrameEl: HTMLElement,
  mediaEl: HTMLElement,
  item: VisualMediaItem,
): void {
  if (item.fit !== "contain" || !item.aspectRatio) {
    return;
  }

  applyMediaAspectRatio(itemEl, item.aspectRatio);
  mediaFrameEl.dataset.fitManaged = "true";
  mediaEl.style.height = "100%";
  mediaEl.style.objectFit = "fill";
  mediaEl.style.width = "100%";
  updateContainedMediaDisplay(itemEl, "immediate");
}

function fitContainedMediaToFrame(
  itemEl: HTMLElement,
  mediaFrameEl: HTMLElement,
  mediaEl: HTMLElement,
  item: VisualMediaItem,
  intrinsicWidth: number,
  intrinsicHeight: number,
): void {
  if (
    item.fit !== "contain"
    || !Number.isFinite(intrinsicWidth)
    || !Number.isFinite(intrinsicHeight)
    || intrinsicWidth <= 0
    || intrinsicHeight <= 0
  ) {
    return;
  }

  mediaFrameEl.dataset.fitManaged = "true";
  mediaEl.style.height = "100%";
  mediaEl.style.objectFit = "fill";
  mediaEl.style.width = "100%";
  updateContainedMediaDisplay(itemEl, "immediate");
}

function updateContainedMediaInRow(rowEl: HTMLElement | null, mode: "immediate" | "scheduled" = "scheduled"): void {
  if (!rowEl) {
    return;
  }

  rowEl.querySelectorAll<HTMLElement>(".visual-media-layout__item").forEach((itemEl) => {
    updateContainedMediaDisplay(itemEl, mode);
  });
}

function cancelContainedMediaInRow(rowEl: HTMLElement | null): void {
  if (!rowEl) {
    return;
  }

  rowEl.querySelectorAll<HTMLElement>(".visual-media-layout__item").forEach((itemEl) => {
    cancelContainedMediaDisplay(itemEl);
  });
}

function updateContainedMediaDisplay(itemEl: HTMLElement, mode: "immediate" | "scheduled" = "scheduled"): void {
  if (mode === "immediate") {
    cancelContainedMediaDisplay(itemEl);
    updateContainedMediaDisplayNow(itemEl);
    return;
  }

  scheduleContainedMediaDisplay(itemEl);
}

function scheduleContainedMediaDisplay(itemEl: HTMLElement): void {
  cancelContainedMediaDisplay(itemEl);
  const frameId = itemEl.ownerDocument.defaultView?.requestAnimationFrame(() => {
    pendingContainedMediaUpdates.delete(itemEl);
    updateContainedMediaDisplayNow(itemEl);
  });
  if (typeof frameId === "number") {
    pendingContainedMediaUpdates.set(itemEl, frameId);
  }
}

function cancelContainedMediaDisplay(itemEl: HTMLElement): void {
  const frameId = pendingContainedMediaUpdates.get(itemEl);
  if (typeof frameId === "number") {
    itemEl.ownerDocument.defaultView?.cancelAnimationFrame(frameId);
    pendingContainedMediaUpdates.delete(itemEl);
  }
}

function updateContainedMediaDisplayNow(itemEl: HTMLElement): void {
  if (itemEl.dataset.fit !== "contain") {
    return;
  }

  const mediaFrameEl = itemEl.querySelector<HTMLElement>(
    ".visual-media-layout__media-frame[data-fit-managed='true']",
  );
  const aspectRatio = getStoredMediaAspectRatio(itemEl);
  if (!mediaFrameEl || !aspectRatio) {
    return;
  }

  const rowHeight = getRowHeightFromElement(itemEl);
  if (rowHeight <= 0) {
    return;
  }

  mediaFrameEl.style.removeProperty("height");
  mediaFrameEl.style.removeProperty("min-height");
  mediaFrameEl.style.removeProperty("width");
  mediaFrameEl.style.setProperty("--visual-media-frame-max-width", `${Math.round(rowHeight * aspectRatio)}px`);
}

function getRowHeightFromElement(itemEl: HTMLElement): number {
  const rowEl = itemEl.closest<HTMLElement>(".visual-media-layout__row");
  const rowHeight = Number.parseFloat(rowEl?.style.getPropertyValue("--visual-media-row-height") ?? "");
  if (Number.isFinite(rowHeight) && rowHeight > 0) {
    return rowHeight;
  }

  const itemHeight = itemEl.getBoundingClientRect().height;
  return Number.isFinite(itemHeight) && itemHeight > 0 ? itemHeight : 0;
}

function registerItemInteractions(
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
): void {
  itemEl.addEventListener("click", (event) => {
    if (event.button !== 0) {
      return;
    }
    selectItem(root, itemEl);
  });

  itemEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectItem(root, itemEl);
    showItemMenu(event, root, itemEl, layout, rowIndex, itemIndex, options);
  });

  itemEl.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLVideoElement) {
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      void deleteItem(root, layout, rowIndex, itemIndex, options);
    }
  });

  itemEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || shouldIgnoreDragStart(event.target)) {
      return;
    }

    registerDragMove(root, itemEl, layout, rowIndex, itemIndex, options, event);
  });
}

function syncSingleMediaRowHeightFromRatio(
  itemEl: HTMLElement,
  rowItemCount: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
): void {
  if (
    rowItemCount !== 1
    || !Number.isFinite(intrinsicWidth)
    || !Number.isFinite(intrinsicHeight)
    || intrinsicWidth <= 0
    || intrinsicHeight <= 0
  ) {
    return;
  }

  const itemWidth = itemEl.getBoundingClientRect().width;
  if (itemWidth <= 0) {
    return;
  }

  const naturalHeight = clampNumber(
    Math.round(itemWidth * (intrinsicHeight / intrinsicWidth)),
    MIN_MEDIA_SIZE,
    MAX_MEDIA_HEIGHT,
  );
  const rowEl = itemEl.closest<HTMLElement>(".visual-media-layout__row");
  rowEl?.style.setProperty("--visual-media-row-height", `${naturalHeight}px`);
  updateContainedMediaInRow(rowEl, "immediate");

  const row = layout.rows[rowIndex];
  const item = row?.items[itemIndex];
  if (row && item) {
    row.height = naturalHeight;
    item.width = Math.round(itemWidth);
    itemEl.style.setProperty("--visual-media-item-width", `${item.width}px`);
  }
}

function storeMediaAspectRatio(
  itemEl: HTMLElement,
  item: VisualMediaItem,
  intrinsicWidth: number,
  intrinsicHeight: number,
): void {
  if (
    !Number.isFinite(intrinsicWidth)
    || !Number.isFinite(intrinsicHeight)
    || intrinsicWidth <= 0
    || intrinsicHeight <= 0
  ) {
    return;
  }

  const aspectRatio = intrinsicWidth / intrinsicHeight;
  item.aspectRatio = aspectRatio;
  applyMediaAspectRatio(itemEl, aspectRatio);
}

function applyMediaAspectRatio(itemEl: HTMLElement, aspectRatio: number): void {
  itemEl.dataset.aspectRatio = String(aspectRatio);
  itemEl.style.setProperty("--visual-media-aspect-ratio", String(aspectRatio));
  itemEl.classList.add("visual-media-layout__item--has-aspect-ratio");
}

function getStoredMediaAspectRatio(itemEl: HTMLElement): number | null {
  const aspectRatio = Number.parseFloat(itemEl.dataset.aspectRatio ?? "");
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null;
}

function renderResizeHandle(
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
  rowItemCount: number,
): void {
  const handleEl = itemEl.createDiv({
    cls: "visual-media-layout__resize-handle",
    attr: {
      role: "button",
    },
  });

  handleEl.addEventListener("pointerdown", (event) => {
    const row = layout.rows[rowIndex];
    const item = row?.items[itemIndex];
    if (!row || !item) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectItem(root, itemEl);
    root.classList.add("visual-media-layout--resizing");
    itemEl.classList.add("visual-media-layout__item--resizing");
    handleEl.setPointerCapture(event.pointerId);

    const rowEl = itemEl.closest<HTMLElement>(".visual-media-layout__row");
    const ownerDocument = itemEl.ownerDocument;
    cancelContainedMediaInRow(rowEl);
    if (rowItemCount === 1) {
      const currentItemWidth = itemEl.getBoundingClientRect().width;
      const currentAspectRatio = getStoredMediaAspectRatio(itemEl);
      if (currentItemWidth > 0 && currentAspectRatio) {
        item.width = Math.round(currentItemWidth);
        row.height = clampNumber(
          Math.round(currentItemWidth / currentAspectRatio),
          MIN_MEDIA_SIZE,
          MAX_MEDIA_HEIGHT,
        );
        rowEl?.style.setProperty("--visual-media-row-height", `${row.height}px`);
        itemEl.style.setProperty("--visual-media-item-width", `${item.width}px`);
        updateContainedMediaInRow(rowEl, "immediate");
      }
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = item.width;
    const startHeight = row.height;
    const rootWidth = Math.max(MIN_MEDIA_SIZE, root.getBoundingClientRect().width);
    const aspectRatio = getStoredMediaAspectRatio(itemEl)
      ?? startWidth / Math.max(MIN_MEDIA_SIZE, startHeight);

    const updateRowPreview = (): void => {
      rowEl?.style.setProperty("--visual-media-row-height", `${row.height}px`);
      updateContainedMediaInRow(rowEl, "immediate");
    };

    const onPointerMove = (moveEvent: PointerEvent): void => {
      moveEvent.preventDefault();

      if (rowItemCount === 1) {
        const nextWidth = clampNumber(startWidth + moveEvent.clientX - startX, MIN_MEDIA_SIZE, rootWidth);
        const nextHeight = clampNumber(Math.round(nextWidth / aspectRatio), MIN_MEDIA_SIZE, MAX_MEDIA_HEIGHT);
        item.width = Math.round(nextWidth);
        row.height = nextHeight;
        itemEl.style.setProperty("--visual-media-item-width", `${item.width}px`);
        updateRowPreview();
        return;
      }

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      const nextHeight = clampNumber(
        startHeight + dominantDelta * ROW_RESIZE_SENSITIVITY,
        MIN_MEDIA_SIZE,
        MAX_MEDIA_HEIGHT,
      );
      row.height = Math.round(nextHeight);
      updateRowPreview();
    };

    const onPointerUp = (upEvent: PointerEvent): void => {
      upEvent.preventDefault();
      root.classList.remove("visual-media-layout--resizing");
      itemEl.classList.remove("visual-media-layout__item--resizing");
      handleEl.releasePointerCapture(event.pointerId);
      ownerDocument.removeEventListener("pointermove", onPointerMove);
      ownerDocument.removeEventListener("pointerup", onPointerUp);
      updateContainedMediaInRow(rowEl, "immediate");

      const scrollX = ownerDocument.defaultView?.scrollX ?? 0;
      const scrollY = ownerDocument.defaultView?.scrollY ?? 0;
      void saveRenderedLayout(options, layout).finally(() => {
        ownerDocument.defaultView?.scrollTo(scrollX, scrollY);
      });
    };

    ownerDocument.addEventListener("pointermove", onPointerMove);
    ownerDocument.addEventListener("pointerup", onPointerUp);
  });
}

function renderColumnResizeHandle(
  root: HTMLElement,
  gridEl: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
  rowItemCount: number,
): void {
  if (rowItemCount <= 1 || itemIndex >= rowItemCount - 1) {
    return;
  }

  const handleEl = itemEl.createDiv({
    cls: "visual-media-layout__column-resize-handle",
    attr: {
      role: "separator",
    },
  });

  handleEl.addEventListener("pointerdown", (event) => {
    const row = layout.rows[rowIndex];
    const currentItem = row?.items[itemIndex];
    const nextItem = row?.items[itemIndex + 1];
    if (!row || !currentItem || !nextItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectItem(root, itemEl);
    root.classList.add("visual-media-layout--resizing");
    itemEl.classList.add("visual-media-layout__item--resizing");
    handleEl.setPointerCapture(event.pointerId);

    const ownerDocument = itemEl.ownerDocument;
    const rowEl = gridEl.closest<HTMLElement>(".visual-media-layout__row");
    cancelContainedMediaInRow(rowEl);
    const startX = event.clientX;
    const startCurrentWidth = currentItem.width;
    const startNextWidth = nextItem.width;
    const pairTotalWidth = startCurrentWidth + startNextWidth;
    const gridWidth = Math.max(MIN_MEDIA_SIZE, gridEl.getBoundingClientRect().width);
    const totalWeight = Math.max(
      MIN_MEDIA_SIZE,
      row.items.reduce((sum, item) => sum + item.width, 0),
    );
    const weightPerPixel = totalWeight / gridWidth;

    const onPointerMove = (moveEvent: PointerEvent): void => {
      moveEvent.preventDefault();
      const deltaWeight = (moveEvent.clientX - startX) * weightPerPixel;
      const nextCurrentWidth = clampNumber(
        startCurrentWidth + deltaWeight,
        MIN_MEDIA_SIZE,
        pairTotalWidth - MIN_MEDIA_SIZE,
      );

      currentItem.width = Math.round(nextCurrentWidth);
      nextItem.width = Math.round(pairTotalWidth - nextCurrentWidth);
      gridEl.style.gridTemplateColumns = getGridTemplateColumns(row);
      updateContainedMediaInRow(rowEl, "immediate");
    };

    const onPointerUp = (upEvent: PointerEvent): void => {
      upEvent.preventDefault();
      root.classList.remove("visual-media-layout--resizing");
      itemEl.classList.remove("visual-media-layout__item--resizing");
      handleEl.releasePointerCapture(event.pointerId);
      ownerDocument.removeEventListener("pointermove", onPointerMove);
      ownerDocument.removeEventListener("pointerup", onPointerUp);
      updateContainedMediaInRow(rowEl, "immediate");

      const scrollX = ownerDocument.defaultView?.scrollX ?? 0;
      const scrollY = ownerDocument.defaultView?.scrollY ?? 0;
      void saveRenderedLayout(options, layout).finally(() => {
        ownerDocument.defaultView?.scrollTo(scrollX, scrollY);
      });
    };

    ownerDocument.addEventListener("pointermove", onPointerMove);
    ownerDocument.addEventListener("pointerup", onPointerUp);
  });
}

function registerDragMove(
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
  startEvent: PointerEvent,
): void {
  const sourceItem = layout.rows[rowIndex]?.items[itemIndex];
  if (!sourceItem) {
    return;
  }

  const ownerDocument = itemEl.ownerDocument;
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  let hasStartedDrag = false;
  let currentDropTarget: DropTarget | null = null;

  const onPointerMove = (moveEvent: PointerEvent): void => {
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (!hasStartedDrag && distance < DRAG_START_DISTANCE) {
      return;
    }

    if (!hasStartedDrag) {
      hasStartedDrag = true;
      selectItem(root, itemEl);
      root.classList.add("visual-media-layout--dragging");
      itemEl.classList.add("visual-media-layout__item--dragging");
    }

    moveEvent.preventDefault();
    currentDropTarget = updateDropIndicator(root, sourceItem.id, moveEvent.clientX, moveEvent.clientY);
  };

  const onPointerUp = (upEvent: PointerEvent): void => {
    ownerDocument.removeEventListener("pointermove", onPointerMove);
    ownerDocument.removeEventListener("pointerup", onPointerUp);

    if (!hasStartedDrag) {
      return;
    }

    upEvent.preventDefault();
    root.classList.remove("visual-media-layout--dragging");
    itemEl.classList.remove("visual-media-layout__item--dragging");
    clearDropIndicators(root);

    if (
      !currentDropTarget
      || (
        currentDropTarget.type === "item"
        && currentDropTarget.rootEl === root
        && currentDropTarget.itemId === sourceItem.id
      )
    ) {
      renderLayoutRows(root, layout, options);
      return;
    }

    const targetState = renderedLayouts.get(currentDropTarget.rootEl);
    if (!targetState || targetState.root.dataset.sourcePath !== root.dataset.sourcePath) {
      renderLayoutRows(root, layout, options);
      return;
    }

    const didMove = targetState.root === root
      ? moveItemWithinLayout(layout, sourceItem.id, currentDropTarget)
      : moveItemToAnotherLayout(layout, targetState.layout, sourceItem.id, currentDropTarget);
    if (!didMove) {
      renderLayoutRows(root, layout, options);
      return;
    }

    renderLayoutRows(root, layout, options);
    if (targetState.root !== root) {
      if (layout.rows.length === 0) {
        root.remove();
      }
      renderLayoutRows(targetState.root, targetState.layout, targetState.options);
      void saveVisualMediaLayoutEdits({
        app: options.app,
        edits: [
          {
            context: options.context,
            containerEl: options.containerEl,
            layout: layout.rows.length > 0 ? layout : null,
            source: options.source,
          },
          {
            context: targetState.options.context,
            containerEl: targetState.options.containerEl,
            layout: targetState.layout,
            source: targetState.options.source,
          },
        ],
      });
      return;
    }

    void saveRenderedLayout(options, layout);
  };

  ownerDocument.addEventListener("pointermove", onPointerMove);
  ownerDocument.addEventListener("pointerup", onPointerUp);
}

function updateDropIndicator(
  root: HTMLElement,
  sourceItemId: string,
  clientX: number,
  clientY: number,
): DropTarget | null {
  clearDropIndicators(root);

  const targetEl = findItemAtPoint(root, sourceItemId, clientX, clientY);
  const targetRoot = targetEl?.closest<HTMLElement>(".visual-media-layout") ?? null;

  if (targetEl && targetRoot) {
    const rect = targetEl.getBoundingClientRect();
    const edgeBandHeight = Math.min(36, rect.height * 0.25);

    if (clientY < rect.top + edgeBandHeight || clientY > rect.bottom - edgeBandHeight) {
      const rowEl = targetEl.closest<HTMLElement>(".visual-media-layout__row");
      if (rowEl?.dataset.rowId) {
        const side: RowDropSide = clientY < rect.top + rect.height / 2 ? "before" : "after";
        rowEl.classList.add(
          side === "before"
            ? "visual-media-layout__row--drop-before"
            : "visual-media-layout__row--drop-after",
        );

        return {
          type: "row",
          rootEl: targetRoot,
          rowId: rowEl.dataset.rowId,
          side,
        };
      }
    }

    const side: DropSide = clientX < rect.left + rect.width / 2 ? "left" : "right";
    targetEl.classList.add(
      side === "left"
        ? "visual-media-layout__item--drop-left"
        : "visual-media-layout__item--drop-right",
    );

    return {
      type: "item",
      rootEl: targetRoot,
      itemId: targetEl.dataset.itemId ?? "",
      side,
    };
  }

  const rowEl = findRowAtPoint(root, clientX, clientY);
  const rowRoot = rowEl?.closest<HTMLElement>(".visual-media-layout") ?? null;

  if (rowEl && rowRoot && rowEl.dataset.rowId) {
    const rowRect = rowEl.getBoundingClientRect();
    const side: RowDropSide = clientY < rowRect.top + rowRect.height / 2 ? "before" : "after";
    rowEl.classList.add(
      side === "before"
        ? "visual-media-layout__row--drop-before"
        : "visual-media-layout__row--drop-after",
    );

    return {
      type: "row",
      rootEl: rowRoot,
      rowId: rowEl.dataset.rowId,
      side,
    };
  }

  const layoutRoot = findLayoutAtPoint(root, clientX, clientY);
  if (!layoutRoot || layoutRoot.dataset.sourcePath !== root.dataset.sourcePath) {
    return null;
  }

  layoutRoot.classList.add("visual-media-layout--drop-inside");

  return {
    type: "layout",
    rootEl: layoutRoot,
  };
}

function findItemAtPoint(
  root: HTMLElement,
  sourceItemId: string,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const candidates = getSameNoteLayoutRoots(root)
    .flatMap((layoutRoot) => Array.from(layoutRoot.querySelectorAll<HTMLElement>(".visual-media-layout__item")));

  return candidates.find((itemEl) => {
    if (itemEl.dataset.itemId === sourceItemId && itemEl.closest(".visual-media-layout") === root) {
      return false;
    }

    return pointIsInsideRect(clientX, clientY, itemEl.getBoundingClientRect());
  }) ?? null;
}

function findRowAtPoint(root: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  const rows = getSameNoteLayoutRoots(root)
    .flatMap((layoutRoot) => Array.from(layoutRoot.querySelectorAll<HTMLElement>(".visual-media-layout__row")));
  const containingRow = rows.find((rowEl) => pointIsInsideRect(clientX, clientY, rowEl.getBoundingClientRect()));
  if (containingRow) {
    return containingRow;
  }

  return rows
    .filter((rowEl) => pointIsNearHorizontalBand(clientX, clientY, rowEl.getBoundingClientRect()))
    .sort((first, second) => (
      verticalDistanceToRect(clientY, first.getBoundingClientRect())
      - verticalDistanceToRect(clientY, second.getBoundingClientRect())
    ))[0] ?? null;
}

function findLayoutAtPoint(root: HTMLElement, clientX: number, clientY: number): HTMLElement | null {
  return getSameNoteLayoutRoots(root).find((layoutRoot) => (
    pointIsInsideRect(clientX, clientY, layoutRoot.getBoundingClientRect())
  )) ?? null;
}

function getSameNoteLayoutRoots(root: HTMLElement): HTMLElement[] {
  const sourcePath = root.dataset.sourcePath;
  return Array.from(root.ownerDocument.querySelectorAll<HTMLElement>(".visual-media-layout"))
    .filter((layoutRoot) => layoutRoot.dataset.sourcePath === sourcePath);
}

function pointIsInsideRect(clientX: number, clientY: number, rect: DOMRect): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function pointIsNearHorizontalBand(clientX: number, clientY: number, rect: DOMRect): boolean {
  const band = 80;
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top - band
    && clientY <= rect.bottom + band;
}

function verticalDistanceToRect(clientY: number, rect: DOMRect): number {
  if (clientY < rect.top) {
    return rect.top - clientY;
  }
  if (clientY > rect.bottom) {
    return clientY - rect.bottom;
  }
  return 0;
}

function clearDropIndicators(root: HTMLElement): void {
  const scope = root.ownerDocument;
  scope.querySelectorAll(".visual-media-layout__item--drop-left").forEach((element) => {
    element.classList.remove("visual-media-layout__item--drop-left");
  });
  scope.querySelectorAll(".visual-media-layout__item--drop-right").forEach((element) => {
    element.classList.remove("visual-media-layout__item--drop-right");
  });
  scope.querySelectorAll(".visual-media-layout__row--drop-before").forEach((element) => {
    element.classList.remove("visual-media-layout__row--drop-before");
  });
  scope.querySelectorAll(".visual-media-layout__row--drop-after").forEach((element) => {
    element.classList.remove("visual-media-layout__row--drop-after");
  });
  scope.querySelectorAll(".visual-media-layout--drop-inside").forEach((element) => {
    element.classList.remove("visual-media-layout--drop-inside");
  });
}

function showItemMenu(
  event: MouseEvent,
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
): void {
  const menu = new Menu();

  menu.addItem((menuItem) => {
    menuItem
      .setTitle("Add/edit text")
      .setIcon("text")
      .onClick(() => {
        showCaptionModal(root, itemEl, layout, rowIndex, itemIndex, options);
      });
  });

  menu.addItem((menuItem) => {
    menuItem
      .setTitle("Show source file in folder")
      .setIcon("folder-search")
      .onClick(() => {
        revealMediaSource(options.app, layout.rows[rowIndex]?.items[itemIndex], options.context.sourcePath);
      });
  });

  menu.addSeparator();

  menu.addItem((menuItem) => {
    menuItem
      .setTitle("Align left")
      .setIcon("align-left")
      .onClick(() => {
        void updateItemAlign(root, itemEl, layout, rowIndex, itemIndex, "left", options);
      });
  });
  menu.addItem((menuItem) => {
    menuItem
      .setTitle("Align center")
      .setIcon("align-center")
      .onClick(() => {
        void updateItemAlign(root, itemEl, layout, rowIndex, itemIndex, "center", options);
      });
  });
  menu.addItem((menuItem) => {
    menuItem
      .setTitle("Align right")
      .setIcon("align-right")
      .onClick(() => {
        void updateItemAlign(root, itemEl, layout, rowIndex, itemIndex, "right", options);
      });
  });

  menu.showAtMouseEvent(event);
}

function showCaptionModal(
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
): void {
  const item = layout.rows[rowIndex]?.items[itemIndex];
  if (!item) {
    return;
  }

  new CaptionModal(options.app, item.caption ?? "", item.captionAlign ?? "left", async (caption, captionAlign) => {
    item.caption = caption.trim() || undefined;
    item.captionAlign = captionAlign;
    renderLayoutRows(root, layout, options);
    await saveRenderedLayout(options, layout);
    const nextItemEl = root.querySelector<HTMLElement>(`[data-item-id="${cssEscape(item.id)}"]`);
    if (nextItemEl) {
      selectItem(root, nextItemEl);
    } else {
      selectItem(root, itemEl);
    }
  }).open();
}

function revealMediaSource(app: App, item: VisualMediaItem | undefined, sourcePath: string): void {
  if (!item) {
    return;
  }

  const file = getMediaFile(app, item.src, sourcePath);
  if (!file) {
    new Notice("Visual Media Layout: this media is not a vault file.");
    return;
  }

  const explorerView = app.workspace.getLeavesOfType("file-explorer")[0]?.view as FileExplorerView | undefined;
  if (!explorerView?.revealInFolder) {
    new Notice("Visual Media Layout: could not find the file explorer.");
    return;
  }

  explorerView.revealInFolder(file);
}

async function toggleNativeFallback(
  root: HTMLElement,
  layout: VisualMediaLayout,
  options: RenderVisualMediaLayoutOptions,
): Promise<void> {
  layout.nativeFallback = layout.nativeFallback !== true;
  await saveRenderedLayout(options, layout);
  if (layout.nativeFallback) {
    hideNativeFallback(root);
  }
}

function selectItem(root: HTMLElement, itemEl: HTMLElement): void {
  root.querySelectorAll(".visual-media-layout__item--selected").forEach((selectedEl) => {
    selectedEl.classList.remove("visual-media-layout__item--selected");
  });
  itemEl.classList.add("visual-media-layout__item--selected");
  itemEl.focus({ preventScroll: true });
}

async function updateItemAlign(
  root: HTMLElement,
  itemEl: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  align: MediaAlign,
  options: RenderVisualMediaLayoutOptions,
): Promise<void> {
  const item = layout.rows[rowIndex]?.items[itemIndex];
  if (!item) {
    return;
  }

  item.align = align;
  itemEl.dataset.align = align;
  selectItem(root, itemEl);

  if (layout.rows[rowIndex]?.items.length === 1) {
    itemEl.style.justifySelf = getSingleItemJustifySelf(align);
  }

  await saveRenderedLayout(options, layout);
}

async function deleteItem(
  root: HTMLElement,
  layout: VisualMediaLayout,
  rowIndex: number,
  itemIndex: number,
  options: RenderVisualMediaLayoutOptions,
): Promise<void> {
  const row = layout.rows[rowIndex];
  if (!row) {
    return;
  }

  row.items.splice(itemIndex, 1);
  layout.rows = layout.rows.filter((currentRow) => currentRow.items.length > 0);

  if (layout.rows.length === 0) {
    root.remove();
    await deleteRenderedLayoutBlock(options);
    return;
  }

  renderLayoutRows(root, layout, options);

  await saveRenderedLayout(options, layout);
}

function saveRenderedLayout(
  options: RenderVisualMediaLayoutOptions,
  layout: VisualMediaLayout,
): Promise<void> {
  return saveVisualMediaLayout({
    app: options.app,
    context: options.context,
    containerEl: options.containerEl,
    layout,
    source: options.source,
  });
}

function deleteRenderedLayoutBlock(options: RenderVisualMediaLayoutOptions): Promise<void> {
  return deleteVisualMediaLayoutBlock({
    app: options.app,
    context: options.context,
    containerEl: options.containerEl,
    source: options.source,
  });
}

function moveItemWithinLayout(
  layout: VisualMediaLayout,
  sourceItemId: string,
  dropTarget: DropTarget,
): boolean {
  if (dropTarget.type === "item") {
    return moveItemBeforeOrAfter(layout, sourceItemId, dropTarget.itemId, dropTarget.side);
  }

  if (dropTarget.type === "row") {
    return moveItemToRowBoundary(layout, sourceItemId, dropTarget.rowId, dropTarget.side);
  }

  return moveItemToLayoutEnd(layout, sourceItemId);
}

function moveItemToLayoutEnd(
  layout: VisualMediaLayout,
  sourceItemId: string,
): boolean {
  const sourceLocation = findItemLocation(layout, sourceItemId);
  if (!sourceLocation) {
    return false;
  }

  const isAlreadyLastSingleRow = sourceLocation.rowIndex === layout.rows.length - 1
    && sourceLocation.row.items.length === 1;
  if (isAlreadyLastSingleRow) {
    return false;
  }

  const [sourceItem] = sourceLocation.row.items.splice(sourceLocation.itemIndex, 1);
  if (!sourceItem) {
    return false;
  }

  layout.rows = layout.rows.filter((row) => row.items.length > 0);
  layout.rows.push({
    id: createUniqueRowId(layout),
    align: sourceItem.align,
    height: sourceLocation.row.height,
    items: [sourceItem],
  });
  rebalanceRows(layout);
  return true;
}

function moveItemToAnotherLayout(
  sourceLayout: VisualMediaLayout,
  targetLayout: VisualMediaLayout,
  sourceItemId: string,
  dropTarget: DropTarget,
): boolean {
  const sourceLocation = findItemLocation(sourceLayout, sourceItemId);
  if (!sourceLocation) {
    return false;
  }

  const [sourceItem] = sourceLocation.row.items.splice(sourceLocation.itemIndex, 1);
  if (!sourceItem) {
    return false;
  }

  sourceLayout.rows = sourceLayout.rows.filter((row) => row.items.length > 0);
  ensureUniqueItemId(targetLayout, sourceItem);

  if (dropTarget.type === "item") {
    const targetLocation = findItemLocation(targetLayout, dropTarget.itemId);
    if (!targetLocation) {
      restoreRemovedItem(sourceLayout, sourceLocation, sourceItem);
      return false;
    }

    const insertIndex = targetLocation.itemIndex + (dropTarget.side === "right" ? 1 : 0);
    targetLocation.row.items.splice(insertIndex, 0, sourceItem);
    rebalanceRows(targetLayout);
    return true;
  }

  const newRow: VisualMediaRow = {
    id: createUniqueRowId(targetLayout),
    align: sourceItem.align,
    height: sourceLocation.row.height,
    items: [sourceItem],
  };

  if (dropTarget.type === "row") {
    const targetRowIndex = targetLayout.rows.findIndex((row) => row.id === dropTarget.rowId);
    const insertIndex = targetRowIndex < 0
      ? targetLayout.rows.length
      : targetRowIndex + (dropTarget.side === "after" ? 1 : 0);
    targetLayout.rows.splice(insertIndex, 0, newRow);
  } else {
    targetLayout.rows.push(newRow);
  }

  rebalanceRows(targetLayout);
  return true;
}

function moveItemBeforeOrAfter(
  layout: VisualMediaLayout,
  sourceItemId: string,
  targetItemId: string,
  side: DropSide,
): boolean {
  const sourceLocation = findItemLocation(layout, sourceItemId);
  if (!sourceLocation || sourceItemId === targetItemId) {
    return false;
  }

  const [sourceItem] = sourceLocation.row.items.splice(sourceLocation.itemIndex, 1);
  if (!sourceItem) {
    return false;
  }

  layout.rows = layout.rows.filter((row) => row.items.length > 0);

  const targetLocation = findItemLocation(layout, targetItemId);
  if (!targetLocation) {
    const fallbackRow = layout.rows[sourceLocation.rowIndex] ?? layout.rows[0];
    if (fallbackRow) {
      fallbackRow.items.splice(sourceLocation.itemIndex, 0, sourceItem);
    } else {
      sourceLocation.row.items.splice(0, 0, sourceItem);
      layout.rows.push(sourceLocation.row);
    }
    return false;
  }

  const insertIndex = targetLocation.itemIndex + (side === "right" ? 1 : 0);
  targetLocation.row.items.splice(insertIndex, 0, sourceItem);
  rebalanceRows(layout);
  return true;
}

function moveItemToRowBoundary(
  layout: VisualMediaLayout,
  sourceItemId: string,
  targetRowId: string,
  side: RowDropSide,
): boolean {
  const sourceLocation = findItemLocation(layout, sourceItemId);
  const targetRowIndexBeforeRemoval = layout.rows.findIndex((row) => row.id === targetRowId);
  if (!sourceLocation || targetRowIndexBeforeRemoval < 0) {
    return false;
  }

  const targetRowBeforeRemoval = layout.rows[targetRowIndexBeforeRemoval];
  if (
    targetRowBeforeRemoval
    && targetRowBeforeRemoval.id === sourceLocation.row.id
    && sourceLocation.row.items.length === 1
  ) {
    return false;
  }

  const [sourceItem] = sourceLocation.row.items.splice(sourceLocation.itemIndex, 1);
  if (!sourceItem) {
    return false;
  }

  layout.rows = layout.rows.filter((row) => row.items.length > 0);

  const targetRowIndex = layout.rows.findIndex((row) => row.id === targetRowId);
  const insertIndex = targetRowIndex < 0
    ? layout.rows.length
    : targetRowIndex + (side === "after" ? 1 : 0);
  const sourceRowHeight = sourceLocation.row.height;

  layout.rows.splice(insertIndex, 0, {
    id: `row-${Date.now()}-${sourceItem.id}`,
    align: sourceItem.align,
    height: sourceRowHeight,
    items: [sourceItem],
  });

  rebalanceRows(layout);
  return true;
}

function findItemLocation(
  layout: VisualMediaLayout,
  itemId: string,
): { row: VisualMediaRow; rowIndex: number; itemIndex: number } | null {
  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex += 1) {
    const row = layout.rows[rowIndex];
    if (!row) {
      continue;
    }

    const itemIndex = row.items.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      return {
        row,
        rowIndex,
        itemIndex,
      };
    }
  }

  return null;
}

function rebalanceRows(layout: VisualMediaLayout): void {
  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex += 1) {
    const row = layout.rows[rowIndex];
    if (!row) {
      continue;
    }

    while (row.items.length > 4) {
      const overflowItem = row.items.pop();
      if (!overflowItem) {
        break;
      }

      let nextRow = layout.rows[rowIndex + 1];
      if (!nextRow) {
        nextRow = {
          id: `row-${Date.now()}-${rowIndex + 1}`,
          align: row.align,
          height: row.height,
          items: [],
        };
        layout.rows.splice(rowIndex + 1, 0, nextRow);
      }

      nextRow.items.unshift(overflowItem);
    }
  }

  layout.rows = layout.rows.filter((row) => row.items.length > 0);
}

function restoreRemovedItem(
  layout: VisualMediaLayout,
  sourceLocation: { row: VisualMediaRow; rowIndex: number; itemIndex: number },
  item: VisualMediaItem,
): void {
  const row = layout.rows[sourceLocation.rowIndex] ?? sourceLocation.row;
  row.items.splice(Math.min(sourceLocation.itemIndex, row.items.length), 0, item);

  if (!layout.rows.includes(row)) {
    layout.rows.splice(Math.min(sourceLocation.rowIndex, layout.rows.length), 0, row);
  }
}

function ensureUniqueItemId(layout: VisualMediaLayout, item: VisualMediaItem): void {
  const itemIds = new Set(layout.rows.flatMap((row) => row.items.map((rowItem) => rowItem.id)));
  if (!itemIds.has(item.id)) {
    return;
  }

  let nextId = `${item.id}-${Date.now()}`;
  while (itemIds.has(nextId)) {
    nextId = `${item.id}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  }
  item.id = nextId;
}

function createUniqueRowId(layout: VisualMediaLayout): string {
  const rowIds = new Set(layout.rows.map((row) => row.id));
  let nextId = `row-${Date.now()}`;
  while (rowIds.has(nextId)) {
    nextId = `row-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  }
  return nextId;
}

function renderMissingMedia(itemEl: HTMLElement, item: VisualMediaItem): void {
  const previewEl = itemEl.createDiv({ cls: "visual-media-layout__missing" });
  previewEl.createDiv({
    cls: "visual-media-layout__type",
    text: item.type === "image" ? "Image not found" : "Video not found",
  });
  previewEl.createDiv({
    cls: "visual-media-layout__source",
    text: getMediaDisplayName(item.src),
    title: item.src,
  });
  previewEl.createDiv({
    cls: "visual-media-layout__meta",
    text: "Check that this file exists in the vault.",
  });
}

function getColumnCount(row: VisualMediaRow): number {
  return Math.min(4, Math.max(1, row.items.length));
}

function getGridTemplateColumns(row: VisualMediaRow): string {
  if (row.items.length <= 1) {
    return "minmax(0, 1fr)";
  }

  return row.items
    .map((item) => `minmax(${MIN_MEDIA_SIZE}px, ${Math.max(MIN_MEDIA_SIZE, item.width)}fr)`)
    .join(" ");
}

function getSingleItemJustifySelf(align: VisualMediaItem["align"]): string {
  if (align === "left") {
    return "start";
  }
  if (align === "right") {
    return "end";
  }
  return "center";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shouldIgnoreDragStart(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest(
      "button, input, textarea, .visual-media-layout__resize-handle, .visual-media-layout__column-resize-handle",
    ));
}

function isLikelyLivePreview(containerEl: HTMLElement): boolean {
  return Boolean(containerEl.closest(".markdown-source-view"));
}

function hideNativeFallback(root: HTMLElement): void {
  root.ownerDocument.defaultView?.requestAnimationFrame(() => {
    const startMarker = findNextFallbackStart(root);
    if (!startMarker) {
      return;
    }

    let currentEl: HTMLElement | null = getFallbackBlockElement(startMarker);
    while (currentEl) {
      currentEl.classList.add("visual-media-layout-fallback-hidden");
      if (currentEl.querySelector(".visual-media-layout-fallback-end")) {
        break;
      }
      currentEl = currentEl.nextElementSibling as HTMLElement | null;
    }
  });
}

function findNextFallbackStart(root: HTMLElement): HTMLElement | null {
  const markers = Array.from(
    root.ownerDocument.querySelectorAll<HTMLElement>(".visual-media-layout-fallback-start"),
  );

  return markers.find((marker) => Boolean(
    root.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING,
  )) ?? null;
}

function getFallbackBlockElement(marker: HTMLElement): HTMLElement {
  const paragraphEl = marker.closest<HTMLElement>("p");
  return paragraphEl ?? marker;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

class CaptionModal extends Modal {
  constructor(
    app: App,
    private readonly initialValue: string,
    private readonly initialAlign: CaptionAlign,
    private readonly onSubmit: (value: string, align: CaptionAlign) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("visual-media-layout-caption-modal");

    this.contentEl.createEl("h3", { text: "Media text" });
    const textareaEl = this.contentEl.createEl("textarea", {
      cls: "visual-media-layout-caption-modal__textarea",
      attr: {
        placeholder: "Type text for this media...",
      },
    });
    textareaEl.value = this.initialValue;

    let captionAlign = this.initialAlign;
    const alignRowEl = this.contentEl.createDiv({ cls: "visual-media-layout-caption-modal__align" });
    const leftButtonEl = alignRowEl.createEl("button", {
      text: "居左",
      attr: {
        type: "button",
      },
    });
    const centerButtonEl = alignRowEl.createEl("button", {
      text: "居中",
      attr: {
        type: "button",
      },
    });
    const updateAlignButtons = (): void => {
      leftButtonEl.classList.toggle("is-active", captionAlign === "left");
      centerButtonEl.classList.toggle("is-active", captionAlign === "center");
    };

    leftButtonEl.addEventListener("click", () => {
      captionAlign = "left";
      updateAlignButtons();
    });
    centerButtonEl.addEventListener("click", () => {
      captionAlign = "center";
      updateAlignButtons();
    });
    updateAlignButtons();

    const buttonRowEl = this.contentEl.createDiv({ cls: "visual-media-layout-caption-modal__buttons" });
    const cancelButtonEl = buttonRowEl.createEl("button", { text: "Cancel" });
    const saveButtonEl = buttonRowEl.createEl("button", {
      text: "Save",
      cls: "mod-cta",
    });

    cancelButtonEl.addEventListener("click", () => {
      this.close();
    });
    saveButtonEl.addEventListener("click", () => {
      void Promise.resolve(this.onSubmit(textareaEl.value, captionAlign)).finally(() => {
        this.close();
      });
    });

    window.setTimeout(() => {
      textareaEl.focus();
      textareaEl.select();
    });
  }
}
