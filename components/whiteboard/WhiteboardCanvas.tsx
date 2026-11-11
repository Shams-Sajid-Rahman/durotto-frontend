"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  Group,
  IText,
  InteractiveFabricObject,
  PencilBrush,
  Rect,
  Textbox,
  util,
  type FabricObject,
} from "fabric";
import type { SignalingMessage } from "@/lib/webrtc/signaling";
import { rooms } from "@/lib/api";
import { type WhiteboardTool } from "@/components/whiteboard/WhiteboardToolbar";

export interface WhiteboardCanvasHandle {
  undo: () => void;
  redo: () => void;
  /** PNG of everything drawn (cropped to the content), or null if the board is empty. */
  exportImage: () => Promise<Blob | null>;
  /** The editable board (Fabric JSON) — embedded in saved PNGs so they can be reopened. */
  exportDocument: () => Record<string, unknown> | null;
}

/** What to show when a standalone board opens (from a saved file). */
export type WhiteboardInitialContent =
  | { kind: "document"; data: Record<string, unknown> }
  | { kind: "image"; dataUrl: string }
  | null;

interface WhiteboardCanvasProps {
  roomId: string;
  currentUserId: string;
  currentTool: WhiteboardTool;
  strokeColor: string;
  strokeWidth: number;
  zoom: number;
  /** Fetch persisted strokes for the room (off for the standalone board). */
  loadHistory?: boolean;
  /** Board or picture to start from (standalone boards opened from Files). */
  initialContent?: WhiteboardInitialContent;
  onSignalingMessage: (callback: (message: SignalingMessage) => void) => () => void;
  sendSignalingMessage: (message: SignalingMessage) => void;
  onUndoRedoChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
}

type DrawAction = "add" | "update" | "remove";

interface DrawPayload {
  strokeId: string;
  action: DrawAction;
  objectData?: unknown;
}

const BACKGROUND = "#FAFAFA";
/** Saved images are rendered at 2× for crisp text and lines. */
const EXPORT_SCALE = 2;
/** Drags shorter than this count as a click (default-size shape). */
const MIN_DRAG_PX = 4;

// Larger, clearly visible selection handles than Fabric's faint defaults, so
// it's obvious that objects can be resized and rotated.
InteractiveFabricObject.ownDefaults = {
  ...InteractiveFabricObject.ownDefaults,
  transparentCorners: false,
  cornerStyle: "circle",
  cornerSize: 12,
  touchCornerSize: 28,
  cornerColor: "#FFFFFF",
  cornerStrokeColor: "#7C5CFF",
  borderColor: "#7C5CFF",
  borderScaleFactor: 1.5,
  padding: 4,
};
const CURSOR_THROTTLE_MS = 50;
const MAX_HISTORY = 100;

function createSticky(x: number, y: number, color: string) {
  const rect = new Rect({
    width: 180,
    height: 120,
    fill: color,
    rx: 14,
    ry: 14,
    stroke: "#D1D5DB",
    strokeWidth: 1,
  });
  const text = new Textbox("Note", {
    left: 16,
    top: 16,
    fontSize: 16,
    width: 148,
    fill: "#111827",
    fontWeight: "600",
  });
  return new Group([rect, text], {
    left: x,
    top: y,
    selectable: true,
    objectCaching: false,
  });
}

function generateStrokeId() {
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function strokeIdOf(object: FabricObject): string | undefined {
  return object.get("strokeId") as string | undefined;
}

function serializeObject(object: FabricObject): Record<string, unknown> {
  return object.toObject(["strokeId"]) as Record<string, unknown>;
}

/** Shared-drawable objects (excludes live cursors). */
function drawables(canvas: Canvas): FabricObject[] {
  return canvas.getObjects().filter((o) => !o.excludeFromExport);
}

function snapshotOf(canvas: Canvas): string {
  return JSON.stringify(canvas.toObject(["strokeId"]));
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
    {
      roomId,
      currentUserId,
      currentTool,
      strokeColor,
      strokeWidth,
      zoom,
      loadHistory = true,
      initialContent = null,
      onSignalingMessage,
      sendSignalingMessage,
      onUndoRedoChange,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const fabricRef = useRef<Canvas | null>(null);
    /** >0 while applying remote/undo changes that must not be re-broadcast. */
    const suppressRef = useRef(0);
    const toolRef = useRef<WhiteboardTool>(currentTool);
    const colorRef = useRef(strokeColor);
    const widthRef = useRef(strokeWidth);
    const historyRef = useRef<string[]>([]);
    const redoRef = useRef<string[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Latest callbacks without re-creating the canvas when they change identity.
    const sendRef = useRef(sendSignalingMessage);
    const subscribeRef = useRef(onSignalingMessage);
    const undoRedoRef = useRef(onUndoRedoChange);
    const userRef = useRef(currentUserId);
    useEffect(() => {
      sendRef.current = sendSignalingMessage;
      subscribeRef.current = onSignalingMessage;
      undoRedoRef.current = onUndoRedoChange;
      userRef.current = currentUserId;
    });

    const undoRef = useRef<() => void>(() => {});
    const redoFnRef = useRef<() => void>(() => {});
    const exportRef = useRef<() => Promise<Blob | null>>(async () => null);
    const exportDocRef = useRef<() => Record<string, unknown> | null>(() => null);
    // Read once when the canvas is created (the panel is keyed by file).
    const initialContentRef = useRef(initialContent);
    useImperativeHandle(ref, () => ({
      exportImage: () => exportRef.current(),
      exportDocument: () => exportDocRef.current(),
      undo: () => undoRef.current(),
      redo: () => redoFnRef.current(),
    }));

    useEffect(() => {
      const element = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!element || !wrapper) return;
      let disposed = false;

      const canvas = new Canvas(element, {
        backgroundColor: BACKGROUND,
        selection: true,
        preserveObjectStacking: true,
        fireRightClick: true,
      });
      fabricRef.current = canvas;

      // Fabric v6+ does not create a brush automatically.
      const brush = new PencilBrush(canvas);
      brush.color = colorRef.current;
      brush.width = widthRef.current;
      canvas.freeDrawingBrush = brush;
      canvas.isDrawingMode = toolRef.current === "pen";

      const resizeCanvas = () => {
        canvas.setDimensions({ width: wrapper.clientWidth, height: wrapper.clientHeight });
        canvas.requestRenderAll();
      };
      resizeCanvas();
      const resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(wrapper);

      const emitUndoState = () =>
        undoRedoRef.current({
          canUndo: historyRef.current.length > 1,
          canRedo: redoRef.current.length > 0,
        });

      const saveHistory = () => {
        const snapshot = snapshotOf(canvas);
        const history = historyRef.current;
        if (history[history.length - 1] === snapshot) return;
        history.push(snapshot);
        if (history.length > MAX_HISTORY) history.shift();
        redoRef.current = [];
        emitUndoState();
      };

      const sendDraw = (payload: DrawPayload) => {
        sendRef.current({
          type: "draw",
          payload: { ...payload, userId: userRef.current, createdAt: new Date().toISOString() },
        });
      };

      const findByStrokeId = (strokeId: string) =>
        drawables(canvas).find((o) => strokeIdOf(o) === strokeId);

      async function enliven(data: unknown): Promise<FabricObject | null> {
        try {
          const [object] = await util.enlivenObjects<FabricObject>([data]);
          return object ?? null;
        } catch {
          return null;
        }
      }

      /** Apply a draw change without echoing it back to the room. */
      async function applyRemote(payload: DrawPayload) {
        const existing = findByStrokeId(payload.strokeId);
        if (payload.action === "remove") {
          if (!existing) return;
          suppressRef.current += 1;
          canvas.remove(existing);
          suppressRef.current -= 1;
          canvas.requestRenderAll();
          return;
        }
        if (payload.action === "add" && existing) return;
        const object = await enliven(payload.objectData);
        if (!object || disposed) return;
        object.set("strokeId", payload.strokeId);
        suppressRef.current += 1;
        if (existing) {
          const index = canvas.getObjects().indexOf(existing);
          canvas.remove(existing);
          canvas.insertAt(Math.max(0, index), object);
        } else {
          canvas.add(object);
        }
        suppressRef.current -= 1;
        canvas.requestRenderAll();
      }

      // ── Local edits → room ──────────────────────────────────────────────────

      canvas.on("object:added", (event) => {
        const object = event.target;
        if (!object || object.excludeFromExport || suppressRef.current > 0) return;
        if (!strokeIdOf(object)) object.set("strokeId", generateStrokeId());
        sendDraw({ strokeId: strokeIdOf(object)!, action: "add", objectData: serializeObject(object) });
        saveHistory();
      });

      canvas.on("object:modified", (event) => {
        const object = event.target;
        if (!object || suppressRef.current > 0) return;

        // Never sync an update for something already erased: the server would
        // treat an update for a missing stroke as a new object and resurrect it.
        const onCanvas = (o: FabricObject) => canvas.getObjects().includes(o);

        const isSelection = object.type === "activeselection" && "getObjects" in object;
        if (!isSelection) {
          if (!onCanvas(object)) return;
          const strokeId = strokeIdOf(object);
          if (strokeId) sendDraw({ strokeId, action: "update", objectData: serializeObject(object) });
          saveHistory();
          return;
        }

        // Members of a multi-selection have coordinates relative to the
        // selection, so it must be dissolved before serialising them. This
        // event fires *inside* Fabric's transform teardown, and discarding the
        // selection here re-enters that teardown (infinite recursion), so do
        // it on the next tick once the transform has fully ended.
        const members = (object as unknown as { getObjects: () => FabricObject[] }).getObjects();
        setTimeout(() => {
          if (disposed) return;
          if (canvas.getActiveObject() === object) canvas.discardActiveObject();
          for (const member of members.filter(onCanvas)) {
            const strokeId = strokeIdOf(member);
            if (strokeId) sendDraw({ strokeId, action: "update", objectData: serializeObject(member) });
          }
          canvas.requestRenderAll();
          saveHistory();
        }, 0);
      });

      canvas.on("object:removed", (event) => {
        const object = event.target;
        if (!object || object.excludeFromExport || suppressRef.current > 0) return;
        const strokeId = strokeIdOf(object);
        if (strokeId) sendDraw({ strokeId, action: "remove" });
        saveHistory();
      });

      /** Shape currently being drawn by dragging (rectangle/ellipse tools). */
      let draft: {
        shape: Rect | Ellipse;
        startX: number;
        startY: number;
        width: number;
        height: number;
      } | null = null;

      canvas.on("mouse:down", (event) => {
        const tool = toolRef.current;
        const pointer = canvas.getScenePoint(event.e);
        const target = event.target && !event.target.excludeFromExport ? event.target : null;

        if (tool === "eraser" && target) {
          canvas.remove(target);
          return;
        }
        if (target) return; // clicking an object selects/moves it

        const stroke = colorRef.current;
        const strokeWidthValue = widthRef.current;
        if (tool === "text") {
          const text = new IText("Text", {
            left: pointer.x,
            top: pointer.y,
            fontSize: 18,
            fill: stroke,
            editable: true,
            strokeWidth: 0,
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
        } else if (tool === "sticky") {
          canvas.add(createSticky(pointer.x, pointer.y, "#FEF3C7"));
        } else if (tool === "rectangle" || tool === "ellipse") {
          // Drag-to-draw: the shape grows with the pointer until mouse-up.
          // Anchored at its top-left so left/top track the drag rectangle
          // (Fabric 7 defaults to a centre origin).
          const common = {
            left: pointer.x,
            top: pointer.y,
            originX: "left" as const,
            originY: "top" as const,
            fill: "transparent",
            stroke,
            strokeWidth: strokeWidthValue,
            strokeUniform: true,
          };
          const shape =
            tool === "rectangle"
              ? new Rect({ ...common, width: 1, height: 1 })
              : new Ellipse({ ...common, rx: 0.5, ry: 0.5 });
          shape.set("strokeId", generateStrokeId());
          // Broadcast once on mouse-up, not while it is still being sized.
          suppressRef.current += 1;
          canvas.add(shape);
          suppressRef.current -= 1;
          draft = { shape, startX: pointer.x, startY: pointer.y, width: 0, height: 0 };
        }
      });

      /** Resize the shape being drawn so it spans start point → pointer. */
      const sizeDraft = (x: number, y: number) => {
        if (!draft) return;
        const left = Math.min(x, draft.startX);
        const top = Math.min(y, draft.startY);
        draft.width = Math.abs(x - draft.startX);
        draft.height = Math.abs(y - draft.startY);
        if (draft.shape instanceof Rect) {
          draft.shape.set({ left, top, width: draft.width, height: draft.height });
        } else {
          draft.shape.set({ left, top, rx: draft.width / 2, ry: draft.height / 2 });
        }
        draft.shape.setCoords();
        canvas.requestRenderAll();
      };

      canvas.on("mouse:up", (event) => {
        if (!draft) return;
        const end = canvas.getScenePoint(event.e);
        sizeDraft(end.x, end.y);
        const finished = draft;
        draft = null;
        // A plain click (no real drag) places a default-sized shape.
        if (finished.width < MIN_DRAG_PX && finished.height < MIN_DRAG_PX) {
          if (finished.shape instanceof Rect) finished.shape.set({ width: 140, height: 90 });
          else finished.shape.set({ rx: 70, ry: 45 });
          finished.shape.setCoords();
        }
        sendDraw({
          strokeId: strokeIdOf(finished.shape)!,
          action: "add",
          objectData: serializeObject(finished.shape),
        });
        saveHistory();
        // Select it so the resize/rotate handles are immediately available.
        canvas.setActiveObject(finished.shape);
        canvas.requestRenderAll();
      });

      // Share our pointer position (throttled) for live cursors.
      let lastCursorSent = 0;
      canvas.on("mouse:move", (event) => {
        if (draft) {
          const p = canvas.getScenePoint(event.e);
          sizeDraft(p.x, p.y);
        }
        const now = Date.now();
        if (now - lastCursorSent < CURSOR_THROTTLE_MS) return;
        lastCursorSent = now;
        const point = canvas.getScenePoint(event.e);
        sendRef.current({ type: "cursor", payload: { x: point.x, y: point.y } });
      });

      // ── Undo / redo (local history, synced to the room as a diff) ──────────

      async function restoreSnapshot(snapshot: string) {
        const before = new Map(
          drawables(canvas)
            .map((o) => [strokeIdOf(o), JSON.stringify(serializeObject(o))] as const)
            .filter((entry): entry is readonly [string, string] => !!entry[0]),
        );
        const cursors = canvas.getObjects().filter((o) => o.excludeFromExport);

        suppressRef.current += 1;
        try {
          await canvas.loadFromJSON(snapshot);
          cursors.forEach((cursor) => canvas.add(cursor));
        } finally {
          suppressRef.current -= 1;
        }
        if (disposed) return;
        canvas.requestRenderAll();

        const after = new Map<string, FabricObject>();
        for (const object of drawables(canvas)) {
          const id = strokeIdOf(object);
          if (id) after.set(id, object);
        }
        for (const [id, json] of before) {
          const object = after.get(id);
          if (!object) sendDraw({ strokeId: id, action: "remove" });
          else if (JSON.stringify(serializeObject(object)) !== json) {
            sendDraw({ strokeId: id, action: "update", objectData: serializeObject(object) });
          }
        }
        for (const [id, object] of after) {
          if (!before.has(id)) {
            sendDraw({ strokeId: id, action: "add", objectData: serializeObject(object) });
          }
        }
        emitUndoState();
      }

      undoRef.current = () => {
        const history = historyRef.current;
        if (history.length <= 1) return;
        redoRef.current.push(history.pop()!);
        void restoreSnapshot(history[history.length - 1]);
      };
      exportRef.current = async () => {
        const objects = drawables(canvas);
        if (objects.length === 0) return null;

        // Crop to the drawn content (scene coordinates) plus a margin.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const object of objects) {
          const box = object.getBoundingRect();
          minX = Math.min(minX, box.left);
          minY = Math.min(minY, box.top);
          maxX = Math.max(maxX, box.left + box.width);
          maxY = Math.max(maxY, box.top + box.height);
        }
        const margin = 32;

        // Export at 1:1 scene scale regardless of the current zoom/pan, then restore.
        const viewport = [...canvas.viewportTransform] as typeof canvas.viewportTransform;
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        try {
          return await canvas.toBlob({
            format: "png",
            multiplier: EXPORT_SCALE,
            left: minX - margin,
            top: minY - margin,
            width: maxX - minX + margin * 2,
            height: maxY - minY + margin * 2,
            // Leave out other people’s live cursors.
            filter: (object) => !object.excludeFromExport,
          });
        } finally {
          canvas.setViewportTransform(viewport);
          canvas.requestRenderAll();
        }
      };

      // Live cursors are excludeFromExport, so toObject() leaves them out.
      exportDocRef.current = () =>
        drawables(canvas).length > 0
          ? (canvas.toObject(["strokeId"]) as Record<string, unknown>)
          : null;

      redoFnRef.current = () => {
        const next = redoRef.current.pop();
        if (!next) return;
        historyRef.current.push(next);
        void restoreSnapshot(next);
      };

      // ── Room → canvas ──────────────────────────────────────────────────────

      const cursors = new Map<string, Circle>();
      const unsubscribe = subscribeRef.current((message) => {
        if (message.type === "draw") {
          const payload = message.payload as DrawPayload | undefined;
          if (!payload?.strokeId || message.senderId === userRef.current) return;
          void applyRemote(payload).then(() => {
            // Remote changes become part of the undo baseline.
            const history = historyRef.current;
            const snapshot = snapshotOf(canvas);
            if (history[history.length - 1] !== snapshot) history.push(snapshot);
          });
          return;
        }

        if (message.type === "cursor" && message.senderId && message.senderId !== userRef.current) {
          const { x, y } = (message.payload ?? {}) as { x?: number; y?: number };
          if (typeof x !== "number" || typeof y !== "number") return;
          let cursor = cursors.get(message.senderId);
          if (!cursor) {
            cursor = new Circle({
              left: x,
              top: y,
              radius: 6,
              fill: "#2563EB",
              selectable: false,
              evented: false,
              excludeFromExport: true,
              originX: "center",
              originY: "center",
            });
            cursors.set(message.senderId, cursor);
            canvas.add(cursor);
          } else {
            cursor.set({ left: x, top: y });
          }
          canvas.requestRenderAll();
          return;
        }

        if (message.type === "peer-left" && message.senderId) {
          const cursor = cursors.get(message.senderId);
          if (cursor) {
            canvas.remove(cursor);
            cursors.delete(message.senderId);
            canvas.requestRenderAll();
          }
        }
      });

      // ── Initial contents ───────────────────────────────────────────────────

      (async () => {
        try {
          const initial = initialContentRef.current;
          if (loadHistory) {
            const strokes = await rooms.whiteboard(roomId);
            for (const stroke of strokes) {
              if (disposed) return;
              if (stroke?.strokeId && stroke.objectData) {
                await applyRemote({ strokeId: stroke.strokeId, action: "add", objectData: stroke.objectData });
              }
            }
          } else if (initial?.kind === "document") {
            // Reopened whiteboard: restore every object, fully editable.
            suppressRef.current += 1;
            try {
              await canvas.loadFromJSON(initial.data);
            } finally {
              suppressRef.current -= 1;
            }
            if (disposed) return;
            canvas.backgroundColor = BACKGROUND;
            for (const object of drawables(canvas)) {
              if (!strokeIdOf(object)) object.set("strokeId", generateStrokeId());
            }
          } else if (initial?.kind === "image") {
            // Plain picture: place it scaled to fit, ready to draw on.
            // (A data URL, so the picture survives in the saved board.)
            const image = await FabricImage.fromURL(initial.dataUrl);
            if (disposed) return;
            const fit = Math.min(
              1,
              (canvas.getWidth() * 0.85) / (image.width || 1),
              (canvas.getHeight() * 0.85) / (image.height || 1),
            );
            image.set({
              left: canvas.getWidth() / 2,
              top: canvas.getHeight() / 2,
              scaleX: fit,
              scaleY: fit,
            });
            image.set("strokeId", generateStrokeId());
            suppressRef.current += 1;
            canvas.add(image);
            suppressRef.current -= 1;
          }
        } catch {
          // History is best-effort; live drawing still works.
        } finally {
          if (!disposed) {
            canvas.requestRenderAll();
            historyRef.current = [snapshotOf(canvas)];
            redoRef.current = [];
            emitUndoState();
            setLoaded(true);
          }
        }
      })();

      return () => {
        disposed = true;
        resizeObserver.disconnect();
        unsubscribe();
        undoRef.current = () => {};
        redoFnRef.current = () => {};
        exportRef.current = async () => null;
        exportDocRef.current = () => null;
        fabricRef.current = null;
        void canvas.dispose();
      };
    }, [roomId, loadHistory]);

    useEffect(() => {
      toolRef.current = currentTool;
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.isDrawingMode = currentTool === "pen";
      canvas.selection = currentTool === "select";
      canvas.defaultCursor =
        currentTool === "rectangle" || currentTool === "ellipse" ? "crosshair" : "default";
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = widthRef.current;
        canvas.freeDrawingBrush.color = colorRef.current;
      }
    }, [currentTool]);

    useEffect(() => {
      colorRef.current = strokeColor;
      const brush = fabricRef.current?.freeDrawingBrush;
      if (brush) brush.color = strokeColor;
    }, [strokeColor]);

    useEffect(() => {
      widthRef.current = strokeWidth;
      const brush = fabricRef.current?.freeDrawingBrush;
      if (brush) brush.width = strokeWidth;
    }, [strokeWidth]);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.setZoom(zoom);
      canvas.requestRenderAll();
    }, [zoom]);

    return (
      <div ref={wrapperRef} className="relative h-full w-full">
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", touchAction: "none" }} />
        {!loaded ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-text-secondary">
            Loading whiteboard…
          </div>
        ) : null}
      </div>
    );
  },
);
