import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { io } from "socket.io-client";

const CanvasBoard = forwardRef(function CanvasBoard(
  { selectedTool, color, strokeWidth },
  ref
) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null); // typo rescue: was stxRef
  const socketRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const previewSnapshot = useRef(null);

  // History changed to ImageData instead of dataURL (faster)
  const historyRef = useRef([]);
  const historyStepRef = useRef(-1);

  // SocketIO
  useEffect(() => {
    socketRef.current = io("http://localhost:4000", { transports: ["websocket"] });

    // TODO(Tatiana): join specific board room once server supports it (socket.emit('join', { roomId, userId })).
    // TODO(Tatiana): add presence listener (socket.on('presence', ...)) and bubble up via CustomEvent if needed.

    socketRef.current.on("draw", ({ tool, from, to, color, strokeWidth }) => {
      // TODO(Tatiana): guard ctxRef being null during teardown (if events arrive late).
      const ctx = ctxRef.current;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      stroke(ctx, from, to); // Fixed: was calling strokeWidth instead of stroke
    });

    socketRef.current.on("erase", (payload) => {
      // TODO(Tatiana): drop legacy 'erase' when all clients emit 'draw' + destination-out
      const ctx = ctxRef.current;
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = payload.strokeWidth;
      stroke(ctx, { x: payload.prevX, y: payload.prevY }, { x: payload.currX, y: payload.currY }); // Fixed
      ctx.globalCompositeOperation = "source-over";
    });

    socketRef.current.on("shape", ({ tool, from, to, color, strokeWidth }) => {
      const ctx = ctxRef.current;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      drawShape[tool]?.(ctx, from, to);
    });

    return () => socketRef.current?.disconnect();
  }, []);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Store current image data before resizing
      const imageData =
        historyStepRef.current >= 0 && historyRef.current[historyStepRef.current];

      // Set actual canvas size with device pixel ratio
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // scale the drawing space to CSS pixels (1 unit == 1 css px)
      // TODO(Tatiana): reset then scale to avoid surprises later:
      // ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr, dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Re-apply context settings
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;

      // restore previous frame if we had one
      if (imageData) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
        // TODO(Tatiana): fine for MVP; revisit if crispness becomes a complaint after resizes.
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1; // NOTE: kept for reference; coords are CSS-space due to transform

    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Return coordinates in CSS pixels (no DPR multiplication needed due to transform)
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const stroke = (ctx, a, b) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.closePath(); // keeps joins tidy when lifting the pen
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

  const drawShape = {
    rectangle: drawRect,
    circle: drawCircle,
    line: drawLine,
  };

  const pushHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
    historyRef.current.push(img);
    historyStepRef.current = historyRef.current.length - 1;

    // TODO(Tatiana): cap history (~100 frames) so long sessions don’t balloon memory
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
    offCtx.putImageData(frame, 0, 0);

    const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
    // TODO(Tatiana): use CSS sizes consistently post-scale; avoid mixing with canvas.width/height in CSS space.
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(off, 0, 0, cssW, cssH);
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      // TODO(Tatiana): clear using CSS rect to match scaled transform (avoid canvas.width/height here).
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pushHistory();
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
      const dataURL = canvasRef.current.toDataURL("image/png");
      localStorage.setItem("whiteboard-save", dataURL);
      alert("Board saved locally.");
      // TODO(Tatiana): wire optional autosave interval (behind Settings toggle).
    },
    exportPNG() {
    // TODO(Tatiana): export at backing-store res (use temp offscreen) for sharper PNGs
      const link = document.createElement("a");
      link.download = "whiteboard.png";
      link.href = canvasRef.current.toDataURL("image/png");
      link.click();
    },
    // TODO(Tatiana): add load(dataURL) so Whiteboard can load without full reload.
  }));

  // Load saved board on mount
  useEffect(() => {
    const saved = localStorage.getItem("whiteboard-save");
    if (!saved) return;
    const img = new Image();
    img.src = saved;
    img.onload = () => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      const { width, height } = canvas.getBoundingClientRect();
      ctx.drawImage(img, 0, 0, width, height);
      pushHistory();
    };
    // TODO(Tatiana): if dataURL is corrupt, clear it and bail gracefully
  }, []);

  // pointer handlers (mouse/touch mixed for now)
// TODO(Tatiana): switch to pointer-only + add pointercancel
  const onPointerDown = (e) => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;

    setIsDrawing(true);
    start.current = getPos(e);

    // Text tool - prompt for text
    if (selectedTool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = color;
        // TODO(Tatiana): textBaseline='top' so click feels like top-left of the text box
        ctx.font = `${strokeWidth * 10}px Arial`;
        ctx.fillText(text, start.current.x, start.current.y);
        ctx.restore();
        pushHistory();
      }
      setIsDrawing(false);
      return;
    }

    // Set drawing styles
    ctx.strokeStyle = color;
    ctx.lineWidth = selectedTool === "eraser" ? strokeWidth * 3 : strokeWidth;
    ctx.globalCompositeOperation = selectedTool === "eraser" ? "destination-out" : "source-over";

    // For pen and eraser, start the path
    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(start.current.x, start.current.y);
      // TODO(Tatiana): if grouping strokes later, emit 'stroke:start' with a strokeId here.
    }

    // Capture snapshot for shape preview
    if (drawShape[selectedTool]) {
      const canvas = canvasRef.current;
      previewSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // TODO(Tatiana): optimistic element lock (server) once ready; deny + toast if locked by someone else.
    }
  };

  const onPointerMove = (e) => {
    if (!isDrawing || !ctxRef.current) return;

    const ctx = ctxRef.current;
    const curr = getPos(e);

    // Pen and eraser - continuous drawing
    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();

      // Emit the drawing event
      // TODO(Tatiana): throttle to ~60fps (rAF/time-based); can mark emits as socket.volatile
      socketRef.current.emit("draw", {
        tool: selectedTool,
        from: start.current,
        to: curr,
        color,
        strokeWidth: ctx.lineWidth,
      });

      start.current = curr;
      return;
    }

    // Shape preview
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

    // End the path for pen/eraser
    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.closePath();
      // TODO(Tatiana): emit 'stroke:end' if we start grouping per-stroke for undo or analytics.
    }

    // Finalize shape
    if (drawShape[selectedTool]) {
      if (previewSnapshot.current) {
        ctx.putImageData(previewSnapshot.current, 0, 0);
      }
      drawShape[selectedTool](ctx, start.current, curr);
      // TODO(Tatiana): guard socketRef being null and probably socket.volatile if shapes are frequent.
      socketRef.current.emit("shape", {
        tool: selectedTool,
        from: start.current,
        to: curr,
        color,
        strokeWidth: strokeWidth,
      });
      // TODO(Tatiana): release element lock (server) once start/stopDrawing APIs exist.
      previewSnapshot.current = null;
    }

    pushHistory();
    ctx.globalCompositeOperation = "source-over";
  };

  return (
    <div className="flex-1 relative overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        style={{
          cursor:
            selectedTool === "eraser"
              ? "cell"
              : selectedTool === "text"
              ? "text"
              : "crosshair",
        }}
      />
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #ddd 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          opacity: 0.3,
        }}
      />
      {/* TODO(Tatiana): honor a gridEnabled prop from Whiteboard to toggle this layer. */}
      {/* TODO(Tatiana): switch to pointer events only (onPointerDown/Move/Up/Cancel) and drop the separate mouse/touch props. */}
    </div>
  );
});

export default CanvasBoard;
