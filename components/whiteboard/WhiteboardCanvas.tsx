"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Canvas,
  Circle,
  Ellipse,
  Group,
  IText,
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
}

interface WhiteboardCanvasProps {
  roomId: string;
  currentUserId: string;
  currentTool: WhiteboardTool;
  strokeColor: string;
  strokeWidth: number;
  zoom: number;
  /** Fetch persisted strokes for the room (off for the standalone board). */
  loadHistory?: boolean;
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
    useImperativeHandle(ref, () => ({
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
        hoverCursor: "default",
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
        } else if (tool === "rectangle") {
          canvas.add(
            new Rect({
              left: pointer.x,
              top: pointer.y,
              width: 140,
              height: 90,
              fill: "transparent",
              stroke,
              strokeWidth: strokeWidthValue,
              strokeUniform: true,
            }),
          );
        } else if (tool === "ellipse") {
          canvas.add(
            new Ellipse({
              left: pointer.x,
              top: pointer.y,
              rx: 70,
              ry: 45,
              fill: "transparent",
              stroke,
              strokeWidth: strokeWidthValue,
              strokeUniform: true,
            }),
          );
        }
      });

      // Share our pointer position (throttled) for live cursors.
      let lastCursorSent = 0;
      canvas.on("mouse:move", (event) => {
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
          if (loadHistory) {
            const strokes = await rooms.whiteboard(roomId);
            for (const stroke of strokes) {
              if (disposed) return;
              if (stroke?.strokeId && stroke.objectData) {
                await applyRemote({ strokeId: stroke.strokeId, action: "add", objectData: stroke.objectData });
              }
            }
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
