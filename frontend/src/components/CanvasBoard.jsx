import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

// my notes:
// - keep this simple; canvas is stateful so we store refs, not react state
// - we replay events from server, push frames to a small history for undo/redo
// - alerts stay for now (todo: swap to a toast later)

const HISTORY_MAX_FRAMES = 100;
const REPLAY_RETRY_MS = 120;

const CanvasBoard = forwardRef(function CanvasBoard(
  { selectedTool, color, strokeWidth, whiteboardId, socket, gridEnabled = true },
  ref
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isInitialized = useRef(false);
  const dprRef = useRef(1);

  const [isDrawing, setIsDrawing] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const previewSnapshot = useRef(null);

  // history: ImageData frames (fast restore)
  const historyRef = useRef([]);
  const historyStepRef = useRef(-1);

  // ----- socket listeners -----
  useEffect(() => {
    if (!socket) return;

    const onCanvasState = ({ events }) => applyEventsImpl(events);

    const onDraw = ({ tool, from, to, color, strokeWidth }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth || 1);
      stroke(ctx, from, to);
      ctx.restore();
    };

    const onErase = ({ prevX, prevY, currX, currY, strokeWidth }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = Math.max(1, strokeWidth || 1);
      stroke(ctx, { x: prevX, y: prevY }, { x: currX, y: currY });
      ctx.restore();
    };

    const onShape = ({ tool, from, to, color, strokeWidth }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth || 1);
      drawShape[tool]?.(ctx, from, to);
      ctx.restore();
    };

    const onText = ({ x, y, text, color, strokeWidth }) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color || "#000";
      const px = Math.max(10, Math.round((strokeWidth || 2) * 10));
      ctx.font = `${px}px Arial`;
      ctx.textBaseline = "top";
      ctx.fillText(text || "", x, y);
      ctx.restore();
    };

    const onBoardCleared = () => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pushHistory();
    };

    socket.on("canvas-state", onCanvasState);
    socket.on("draw", onDraw);
    socket.on("erase", onErase);
    socket.on("shape", onShape);
    socket.on("text", onText);
    socket.on("board-cleared", onBoardCleared);

    return () => {
      socket.off("canvas-state", onCanvasState);
      socket.off("draw", onDraw);
      socket.off("erase", onErase);
      socket.off("shape", onShape);
      socket.off("text", onText);
      socket.off("board-cleared", onBoardCleared);
    };
  }, [socket]);

  // ----- canvas setup / resize -----
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctxRef.current = ctx;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;

      // keep last frame before we resize backing store
      const imageData =
        historyStepRef.current >= 0 && historyRef.current[historyStepRef.current];

      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;

      // draw in CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;

      // restore the frame if we had one
      if (imageData) {
        const off = document.createElement("canvas");
        off.width = imageData.width;
        off.height = imageData.height;
        const offCtx = off.getContext("2d");
        if (offCtx) {
          offCtx.putImageData(imageData, 0, 0);
          ctx.drawImage(off, 0, 0, w, h);
        }
      }

      // first-time init: try loading a saved copy
      if (!isInitialized.current && w > 0 && h > 0) {
        isInitialized.current = true;
        loadSavedBoard();
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ----- helpers -----
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let x, y;

    if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }

    return { x: x - rect.left, y: y - rect.top };
  };

  const stroke = (ctx, a, b) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.closePath();
  };

  const drawRect = (ctx, a, b) => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.strokeRect(x, y, w, h);
  };

  const drawCircle = (ctx, a, b) => {
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawLine = (ctx, a, b) => stroke(ctx, a, b);

  const drawShape = { rectangle: drawRect, circle: drawCircle, line: drawLine };

  const pushHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const { width, height } = canvas;
    if (width <= 0 || height <= 0) return;

    try {
      const img = ctx.getImageData(0, 0, width, height);
      historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
      historyRef.current.push(img);
      historyStepRef.current = historyRef.current.length - 1;

      if (historyRef.current.length > HISTORY_MAX_FRAMES) {
        historyRef.current.shift();
        historyStepRef.current = historyRef.current.length - 1;
      }
    } catch (err) {
      console.error("canvas: pushHistory failed", err);
    }
  };

  const restoreHistory = (step) => {
    const frame = historyRef.current[step];
    if (!frame) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    const off = document.createElement("canvas");
    off.width = frame.width;
    off.height = frame.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    offCtx.putImageData(frame, 0, 0);

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(off, 0, 0, rect.width, rect.height);
  };

  const loadSavedBoard = () => {
    if (!isInitialized.current) return;

    const storageKey = whiteboardId ? `whiteboard-save-${whiteboardId}` : "whiteboard-save";
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    const img = new Image();
    img.src = saved;
    img.onload = () => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        pushHistory();
      }
    };
    img.onerror = () => {
      console.error("canvas: saved image load failed");
      localStorage.removeItem(storageKey);
    };
  };

  // ----- expose methods to parent -----
  useImperativeHandle(ref, () => ({
    applyEvents(events) {
      applyEventsImpl(events);
    },
    clear() {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pushHistory();

      if (socket && whiteboardId) socket.emit("board-cleared", { roomId: whiteboardId });
    },
    undo() {
      if (historyStepRef.current > 0) {
        historyStepRef.current -= 1;
        restoreHistory(historyStepRef.current);
      }
    },
    redo() {
      if (historyStepRef.current < historyRef.current.length - 1) {
        historyStepRef.current += 1;
        restoreHistory(historyStepRef.current);
      }
    },
    save() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const dataURL = canvas.toDataURL("image/png");
        const storageKey = whiteboardId ? `whiteboard-save-${whiteboardId}` : "whiteboard-save";
        localStorage.setItem(storageKey, dataURL);
        alert("Saved to this browser."); // todo: toast + server export
        if (socket && whiteboardId) socket.emit("board-saved", { roomId: whiteboardId });
      } catch (err) {
        console.error("canvas: save failed", err);
        alert("Save failed.");
      }
    },
    exportPNG() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const link = document.createElement("a");
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = whiteboardId ? `whiteboard-${whiteboardId}-${ts}.png` : `whiteboard-${ts}.png`;
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.error("canvas: export failed", err);
        alert("Export failed.");
      }
    },
    loadFromDataURL(dataURL) {
      if (!dataURL || typeof dataURL !== "string") return;
      const img = new Image();
      img.src = dataURL;
      img.onload = () => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        pushHistory();
      };
      img.onerror = () => console.error("canvas: bad dataURL");
    },
    loadElements(elements) {
      const ctx = ctxRef.current;
      if (!ctx || !Array.isArray(elements)) return;

      elements.forEach((el) => {
        try {
          const w = Math.max(1, Number(el.strokeWidth) || 1);
          ctx.save();
          ctx.globalCompositeOperation = el.tool === "eraser" ? "destination-out" : "source-over";
          ctx.strokeStyle = el.color || "#000";
          ctx.fillStyle = el.color || "#000";
          ctx.lineWidth = w;

          switch (el.type || el.tool) {
            case "pen":
            case "line":
              if (el.from && el.to) stroke(ctx, el.from, el.to);
              break;
            case "rectangle":
              if (el.from && el.to) drawRect(ctx, el.from, el.to);
              break;
            case "circle":
              if (el.from && el.to) drawCircle(ctx, el.from, el.to);
              break;
            case "text": {
              const px = Math.max(10, Math.round((el.strokeWidth || 2) * 10));
              ctx.font = `${px}px Arial`;
              ctx.textBaseline = "top";
              ctx.fillText(el.text || "", el.x, el.y);
              break;
            }
            default:
              // ignore unknown
              break;
          }
          ctx.restore();
        } catch (err) {
          console.error("canvas: loadElements draw error", err);
        }
      });

      pushHistory();
    },
  }));

  // ----- pointer handlers -----
  const onPointerDown = (e) => {
    if (!ctxRef.current || !isInitialized.current) return;
    const ctx = ctxRef.current;

    setIsDrawing(true);
    start.current = getPos(e);

    if (selectedTool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = color;
        const px = Math.max(10, Math.round(strokeWidth * 10));
        ctx.font = `${px}px Arial`;
        ctx.textBaseline = "top";
        ctx.fillText(text, start.current.x, start.current.y);
        ctx.restore();
        pushHistory();

        if (socket && whiteboardId) {
          socket.emit("text", {
            roomId: whiteboardId,
            x: start.current.x,
            y: start.current.y,
            text,
            color,
            strokeWidth,
          });
        }
      }
      setIsDrawing(false);
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = selectedTool === "eraser" ? strokeWidth * 3 : strokeWidth;
    ctx.globalCompositeOperation = selectedTool === "eraser" ? "destination-out" : "source-over";

    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(start.current.x, start.current.y);
    }

    if (drawShape[selectedTool]) {
      const canvas = canvasRef.current;
      try {
        previewSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (err) {
        console.error("canvas: preview snapshot fail", err);
      }
    }
  };

  const onPointerMove = (e) => {
    if (!isDrawing || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const curr = getPos(e);

    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();

      if (socket && whiteboardId) {
        socket.emit("draw", {
          roomId: whiteboardId,
          tool: selectedTool,
          from: start.current,
          to: curr,
          color,
          strokeWidth: ctx.lineWidth,
        });
      }

      start.current = curr;
      return;
    }

    if (previewSnapshot.current && drawShape[selectedTool]) {
      ctx.putImageData(previewSnapshot.current, 0, 0);
      drawShape[selectedTool](ctx, start.current, curr);
    }
  };

  const onPointerUp = (e) => {
    if (!isDrawing || !ctxRef.current) return;
    setIsDrawing(false);

    const ctx = ctxRef.current;
    const curr = getPos(e);

    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.closePath();
    }

    if (drawShape[selectedTool]) {
      if (previewSnapshot.current) {
        ctx.putImageData(previewSnapshot.current, 0, 0);
      }
      drawShape[selectedTool](ctx, start.current, curr);

      if (socket && whiteboardId) {
        socket.emit("shape", {
          roomId: whiteboardId,
          tool: selectedTool,
          from: start.current,
          to: curr,
          color,
          strokeWidth,
        });
      }
      previewSnapshot.current = null;
    }

    pushHistory();
    ctx.globalCompositeOperation = "source-over";
  };

  // ----- replay a batch of events -----
  const applyEventsImpl = (events) => {
    if (!isInitialized.current) {
      setTimeout(() => applyEventsImpl(events), REPLAY_RETRY_MS);
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx || !Array.isArray(events) || events.length === 0) return;

    events.forEach((event, idx) => {
      const { type, ...payload } = event || {};
      try {
        switch (type) {
          case "draw": {
            ctx.save();
            ctx.globalCompositeOperation =
              payload.tool === "eraser" ? "destination-out" : "source-over";
            ctx.strokeStyle = payload.color;
            ctx.lineWidth = Math.max(1, payload.strokeWidth || 1);
            stroke(ctx, payload.from, payload.to);
            ctx.restore();
            break;
          }
          case "erase": {
            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = Math.max(1, payload.strokeWidth || 1);
            stroke(
              ctx,
              { x: payload.prevX, y: payload.prevY },
              { x: payload.currX, y: payload.currY }
            );
            ctx.restore();
            break;
          }
          case "shape": {
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = payload.color;
            ctx.lineWidth = Math.max(1, payload.strokeWidth || 1);
            const draw = drawShape[payload.tool];
            if (typeof draw === "function") draw(ctx, payload.from, payload.to);
            ctx.restore();
            break;
          }
          case "text": {
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = payload.color || "#000";
            const px = Math.max(10, Math.round((payload.strokeWidth || 2) * 10));
            ctx.font = `${px}px Arial`;
            ctx.textBaseline = "top";
            ctx.fillText(payload.text || "", payload.x, payload.y);
            ctx.restore();
            break;
          }
          default:
            // ignore unknown types
            break;
        }
      } catch (err) {
        console.error(`canvas: replay error at ${idx + 1}/${events.length}`, err);
      }
    });

    pushHistory();
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] overflow-hidden bg-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 block"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        style={{
          cursor:
            selectedTool === "eraser" ? "cell" :
            selectedTool === "text" ? "text" : "crosshair",
          touchAction: "none", // allow drawing without browser gestures
        }}
      />

      {gridEnabled && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #ddd 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            opacity: 0.3,
          }}
        />
      )}
    </div>
  );
});

export default CanvasBoard;

// source idea for event flow:
// https://github.com/socketio/socket.io/tree/main/examples/whiteboard
