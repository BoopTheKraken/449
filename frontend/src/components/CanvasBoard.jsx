// This is our collaborative whiteboard. Everyone draws in the same
// logical space of 1920x1080. We scale the canvas visually to fit
// each screen, but all drawing coordinates are kept normalized so
// users on large monitors and tablets see the same content.
//

import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { API_URL } from "../utils/api";

// Logical canvas space shared by all clients
const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

// History and replay behavior
const HISTORY_MAX_FRAMES = 100;
const REPLAY_RETRY_MS = 120;

// Local autosave delay 1.2s (any faster, it crashes so 1.2 was ideal number)
const AUTOSAVE_MS = 1200;

const CanvasBoard = forwardRef(function CanvasBoard(
  {
    selectedTool,
    color,
    strokeWidth,
    whiteboardId,
    socket,
    gridEnabled = true,
    sessionToken,
  },
  ref
) {
  // DOM and drawing refs
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  // Internal flags and metrics
  const isInitialized = useRef(false);
  const hasLoadedContent = useRef(false);
  const dprRef = useRef(1);

  // Pointer state
  const [isDrawing, setIsDrawing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const previewSnapshot = useRef(null);

  // Text input state
  const [textInput, setTextInput] = useState(null); // { x, y, text, userId }
  const [activeTexts, setActiveTexts] = useState([]); // texts being typed by others
  const textInputRef = useRef(null);
  const textInputCreatedTime = useRef(0);

  // Selection state
  const [selection, setSelection] = useState(null); // { x, y, width, height, imageData }
  const [selectionDragging, setSelectionDragging] = useState(false);
  const [lassoPath, setLassoPath] = useState([]); // for lasso tool
  const selectionRef = useRef(null);

  // History of ImageData frames (backing store space)
  const historyRef = useRef([]);
  const historyStepRef = useRef(-1);

  // CSS sizing (kept for future debugging or overlays)
  const cssSizeRef = useRef({
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    left: 0,
    top: 0,
  });

  // Autosave timer
  const autosaveTimerRef = useRef(null);

  // Text input handlers
  const handleTextInputChange = (e) => {
    const newText = e.target.value;
    setTextInput((prev) => {
      const updated = { ...prev, text: newText };

      // Broadcast typing to others
      if (socket && whiteboardId) {
        socket.emit("text-typing", {
          roomId: whiteboardId,
          x: updated.x,
          y: updated.y,
          text: newText,
          color,
          strokeWidth,
        });
      }

      return updated;
    });
  };

  const finalizeTextInput = () => {
    if (!textInput) return;

    // Prevent immediate blur after creation (200ms to start typing - typing display was resolved using ChatGPT)
    const timeSinceCreation = Date.now() - textInputCreatedTime.current;
    if (timeSinceCreation < 200) {
      if (textInputRef.current) {
        textInputRef.current.focus();
      }
      return;
    }

    if (!textInput.text.trim()) {
      setTextInput(null);
      if (socket && whiteboardId) {
        socket.emit("text-finalized", { roomId: whiteboardId });
      }
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;

    // Draw text on canvas
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    const px = Math.max(10, Math.round(strokeWidth * 10));
    ctx.font = `${px}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(textInput.text, textInput.x, textInput.y);
    ctx.restore();
    pushHistory();

    // Emit finalized text to others
    if (socket && whiteboardId) {
      socket.emit("text", {
        roomId: whiteboardId,
        x: textInput.x,
        y: textInput.y,
        text: textInput.text,
        color,
        strokeWidth,
      });
      socket.emit("text-finalized", { roomId: whiteboardId });
    }

    setTextInput(null);
  };

  const handleTextInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finalizeTextInput();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTextInput(null);
      if (socket && whiteboardId) {
        socket.emit("text-finalized", { roomId: whiteboardId });
      }
    }
  };

  // Board-specific localStorage key for autosave
  const specificKey = useMemo(
    () => (whiteboardId ? `whiteboard-cache-${whiteboardId}` : null),
    [whiteboardId]
  );

  // Clean up old generic cache on mount (one-time migration)
  useEffect(() => {
    try {
      localStorage.removeItem("whiteboard-cache");
    } catch (e) {
      // ignore
    }
  }, []);

  // Convert mouse/touch event into logical coords (1920x1080 space)
  // This handles iPad Safari "touchend" where touches[] is empty.
  // (This was a crash before; fixed with ChatGPT.)
  const clientToLogical = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let cx, cy;
    if (e && typeof e === "object") {
      if ("touches" in e && e.touches && e.touches.length > 0) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
      } else if (
        "changedTouches" in e &&
        e.changedTouches &&
        e.changedTouches.length > 0
      ) {
        cx = e.changedTouches[0].clientX;
        cy = e.changedTouches[0].clientY;
      } else if ("clientX" in e && "clientY" in e) {
        cx = e.clientX;
        cy = e.clientY;
      }
    }

    if (typeof cx !== "number" || typeof cy !== "number") {
      const last = dragStart.current || { x: 0, y: 0 };
      return { x: last.x, y: last.y };
    }

    const lx = ((cx - rect.left) / rect.width) * VIRTUAL_WIDTH;
    const ly = ((cy - rect.top) / rect.height) * VIRTUAL_HEIGHT;
    return { x: lx, y: ly };
  };

  // Simple drawing helper functions (work in logical coordinates)
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

  // Cut selection (rectangular)
  const cutSelection = (x, y, width, height) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const dpr = dprRef.current || 1;

    // Extract image data from selection
    const sx = Math.round(x * dpr);
    const sy = Math.round(y * dpr);
    const sw = Math.round(width * dpr);
    const sh = Math.round(height * dpr);

    try {
      const imageData = ctx.getImageData(sx, sy, sw, sh);

      // Clear the selected area
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(x, y, width, height);
      ctx.restore();

      // Store selection
      setSelection({
        x,
        y,
        width,
        height,
        imageData,
      });

      pushHistory();

      // Broadcast the cut to other users
      if (socket && whiteboardId) {
        console.log("Emitting selection-cut (rect):", {
          roomId: whiteboardId,
          x,
          y,
          width,
          height,
          type: "rect",
        });
        socket.emit("selection-cut", {
          roomId: whiteboardId,
          x,
          y,
          width,
          height,
          type: "rect",
        });
      }
    } catch (err) {
      console.error("Cut selection error:", err);
    }
  };

  // Cut lasso selection
  const cutLassoSelection = (path) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx || path.length < 3) return;

    const dpr = dprRef.current || 1;

    // Find bounding box of lasso path
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    path.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });

    const x = minX;
    const y = minY;
    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 5 || height < 5) return;

    try {
      const sx = Math.round(x * dpr);
      const sy = Math.round(y * dpr);
      const sw = Math.round(width * dpr);
      const sh = Math.round(height * dpr);

      const imageData = ctx.getImageData(sx, sy, sw, sh);

      // Create mask from lasso path
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = sw;
      maskCanvas.height = sh;
      const maskCtx = maskCanvas.getContext("2d");

      // Draw lasso path as filled region (white = keep, black = discard)
      maskCtx.fillStyle = "black";
      maskCtx.fillRect(0, 0, sw, sh);

      // Fill the lasso area with white
      maskCtx.fillStyle = "white";
      maskCtx.beginPath();
      maskCtx.moveTo((path[0].x - x) * dpr, (path[0].y - y) * dpr);
      for (let i = 1; i < path.length; i++) {
        maskCtx.lineTo((path[i].x - x) * dpr, (path[i].y - y) * dpr);
      }
      maskCtx.closePath();
      maskCtx.fill();

      // Apply mask to imageData - keep only white areas
      const maskData = maskCtx.getImageData(0, 0, sw, sh);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (maskData.data[i] === 0) {
          // Black area - make transparent
          imageData.data[i + 3] = 0;
        }
      }

      // Clear the lasso area on canvas
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(x, y, width, height);
      ctx.restore();

      // Store selection
      setSelection({
        x,
        y,
        width,
        height,
        imageData,
        isLasso: true,
      });

      pushHistory();

      // Broadcast the lasso cut to other users
      if (socket && whiteboardId) {
        // Send the lasso path so others can clear the same area
        console.log("Emitting selection-cut (lasso):", {
          roomId: whiteboardId,
          x,
          y,
          width,
          height,
          type: "lasso",
          pathLength: path.length,
        });
        socket.emit("selection-cut", {
          roomId: whiteboardId,
          x,
          y,
          width,
          height,
          type: "lasso",
          path: path,
        });
      }
    } catch (err) {
      console.error("Cut lasso selection error:", err);
    }
  };

  // Flood fill algorithm for paint bucket tool
  const floodFill = (ctx, x, y, fillColor) => {
    const canvas = canvasRef.current;
    if (!canvas || !ctx) return;

    const dpr = dprRef.current || 1;

    // Save current transform
    ctx.save();

    // Reset transform to get raw pixel data
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    // Convert click coordinates to pixel coordinates
    const startX = Math.floor(x * dpr);
    const startY = Math.floor(y * dpr);

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
      ctx.restore();
      return;
    }

    // Get target color at click point
    const startPos = (startY * width + startX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    const targetA = data[startPos + 3];

    // Parse fill color (hex to RGB)
    const hex = fillColor.replace('#', '');
    const fillR = parseInt(hex.substring(0, 2), 16);
    const fillG = parseInt(hex.substring(2, 4), 16);
    const fillB = parseInt(hex.substring(4, 6), 16);
    const fillA = 255;

    // Don't fill if target color is same as fill color
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
      ctx.restore();
      return;
    }

    // Stack-based flood fill to avoid recursion limits
    const stack = [[startX, startY]];
    const visited = new Set();

    const colorMatch = (pos) => {
      return (
        data[pos] === targetR &&
        data[pos + 1] === targetG &&
        data[pos + 2] === targetB &&
        data[pos + 3] === targetA
      );
    };

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const key = `${cx},${cy}`;

      if (visited.has(key)) continue;
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

      const pos = (cy * width + cx) * 4;
      if (!colorMatch(pos)) continue;

      visited.add(key);

      // Fill this pixel
      data[pos] = fillR;
      data[pos + 1] = fillG;
      data[pos + 2] = fillB;
      data[pos + 3] = fillA;

      // Add neighbors to stack
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }

    // Put the modified image data back
    ctx.putImageData(imageData, 0, 0);

    // Restore the transform
    ctx.restore();
  };

   // Capture a history frame (with DPR) and debounce autosave.
  const pushHistory = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    try {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current = historyRef.current.slice(
        0,
        historyStepRef.current + 1
      );
      historyRef.current.push(img);
      historyStepRef.current = historyRef.current.length - 1;
      if (historyRef.current.length > HISTORY_MAX_FRAMES) {
        historyRef.current.shift();
        historyStepRef.current = historyRef.current.length - 1;
      }
    } catch (err) {
      console.error("canvas: pushHistory failed", err);
    }
    // Save 1.2s after last change.
    queueLocalAutosave();
  };

  // Restore a frame from history (scaled back into logical space)
  const restoreHistory = (idx) => {
    const frame = historyRef.current[idx];
    if (!frame) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas) return;

    const off = document.createElement("canvas");
    off.width = frame.width;
    off.height = frame.height;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    offCtx.putImageData(frame, 0, 0);

    ctx.save();
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.drawImage(
      off,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      VIRTUAL_WIDTH,
      VIRTUAL_HEIGHT
    );
    ctx.restore();
  };

  // Scan the backing store for non-transparent bounds and return LOGICAL bounds.
  // (This is how we crop for autosave + server save without white backgrounds.)
  const getContentBoundsLogical = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return null;

    const dpr = dprRef.current || 1;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = img;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let has = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          has = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!has) return null;

    const padPx = Math.round(10 * dpr);
    minX = Math.max(0, minX - padPx);
    minY = Math.max(0, minY - padPx);
    maxX = Math.min(width - 1, maxX + padPx);
    maxY = Math.min(height - 1, maxY + padPx);

    const toLogical = (n) => n / dpr;
    return {
      x: toLogical(minX),
      y: toLogical(minY),
      width: toLogical(maxX - minX + 1),
      height: toLogical(maxY - minY + 1),
    };
  };

  // Local autosave of a cropped transparent PNG and logical bounds
  const autosaveToLocal = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const dpr = dprRef.current || 1;
    const bounds = getContentBoundsLogical();

    try {
      let payload;

      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const temp = document.createElement("canvas");
        temp.width = Math.round(bounds.width);
        temp.height = Math.round(bounds.height);
        const tctx = temp.getContext("2d");
        tctx.drawImage(
          canvas,
          Math.round(bounds.x * dpr),
          Math.round(bounds.y * dpr),
          Math.round(bounds.width * dpr),
          Math.round(bounds.height * dpr),
          0,
          0,
          temp.width,
          temp.height
        );
        payload = {
          img: temp.toDataURL("image/png"),
          bounds,
          vw: VIRTUAL_WIDTH,
          vh: VIRTUAL_HEIGHT,
          ts: Date.now(),
        };
      } else {
        const t = document.createElement("canvas");
        t.width = 1;
        t.height = 1;
        payload = {
          img: t.toDataURL("image/png"),
          bounds: { x: 0, y: 0, width: 1, height: 1 },
          vw: VIRTUAL_WIDTH,
          vh: VIRTUAL_HEIGHT,
          ts: Date.now(),
        };
      }

      const blob = JSON.stringify(payload);
      // Only save to board-specific key to avoid cross-contamination
      if (specificKey) {
        localStorage.setItem(specificKey, blob);
      }
    } catch {
      // ignore private mode or quota errors
    }
  };

  const queueLocalAutosave = () => {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(autosaveToLocal, AUTOSAVE_MS);
  };

  // Socket listeners for normalized events
  useEffect(() => {
    if (!socket) return;

    const onDraw = ({ tool, from: fromPt, to: toPt, color, strokeWidth }) => {
      if (!fromPt || !toPt) return;
      const ctx = ctxRef.current;
      if (!ctx) return;

      // Ensure proper transform is set
      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth || 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      stroke(ctx, { x: fromPt.x, y: fromPt.y }, { x: toPt.x, y: toPt.y });
      ctx.restore();
      queueLocalAutosave();
    };

    const onShape = ({ tool, from: fromPt, to: toPt, color, strokeWidth }) => {
      console.log("Received shape event:", { tool, from: fromPt, to: toPt, color, strokeWidth });
      if (!fromPt || !toPt) return;
      const ctx = ctxRef.current;
      if (!ctx) return;

      // Ensure proper transform is set
      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, strokeWidth || 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw the shape
      drawShape[tool]?.(ctx, fromPt, toPt);
      ctx.restore();

      console.log("Shape drawn, pushing to history");
      pushHistory();
      queueLocalAutosave();
    };

    const onText = ({ x, y, text, color, strokeWidth }) => {
      if (typeof x !== "number" || typeof y !== "number") return;
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
      queueLocalAutosave();
    };

    const onTextTyping = ({ x, y, text, color, strokeWidth, userId }) => {
      // Update the active texts being typed by others
      setActiveTexts((prev) => {
        const filtered = prev.filter((t) => t.userId !== userId);
        if (text && text.length > 0) {
          return [...filtered, { x, y, text, color, strokeWidth, userId }];
        }
        return filtered;
      });
    };

    const onTextFinalized = ({ userId }) => {
      // Remove from active texts when finalized
      setActiveTexts((prev) => prev.filter((t) => t.userId !== userId));
    };

    const onBoardCleared = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!ctx || !canvas) return;
      ctx.save();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      ctx.restore();
      pushHistory();
      queueLocalAutosave();
      // Clear active texts when board is cleared
      setActiveTexts([]);
      setTextInput(null);
    };

    const onFill = ({ x, y, color }) => {
      console.log("Received fill event:", { x, y, color });
      if (typeof x !== "number" || typeof y !== "number") return;
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      console.log("Applying fill from remote user");

      // Ensure proper transform is set
      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.restore();

      // Apply the fill
      floodFill(ctx, x, y, color || "#000");

      console.log("Fill applied, pushing to history");

      // Push to history and save
      pushHistory();
      queueLocalAutosave();
    };

    const onPasteSelection = async ({ x, y, width, height, dataURL }) => {
      if (!dataURL) return;
      const ctx = ctxRef.current;
      if (!ctx) return;

      const img = new Image();
      img.src = dataURL;
      img.onload = () => {
        ctx.save();
        ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
        ctx.drawImage(img, x, y, width, height);
        ctx.restore();
        pushHistory();
      };
    };

    const onSelectionCut = ({ x, y, width, height, type, path }) => {
      console.log("Received selection-cut event:", { x, y, width, height, type, pathLength: path?.length });
      const ctx = ctxRef.current;
      if (!ctx) {
        console.log("No context available for selection-cut");
        return;
      }

      const dpr = dprRef.current || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (type === "rect") {
        console.log("Clearing rectangular area:", { x, y, width, height });
        // Clear rectangular area
        ctx.clearRect(x, y, width, height);
      } else if (type === "lasso" && path && path.length > 0) {
        console.log("Clearing lasso area with path length:", path.length);
        // Clear lasso area
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.clearRect(x, y, width, height);
      }

      ctx.restore();
      console.log("Selection cut applied, pushing to history");
      pushHistory();
    };

    socket.on("draw", onDraw);
    socket.on("shape", onShape);
    socket.on("text", onText);
    socket.on("text-typing", onTextTyping);
    socket.on("text-finalized", onTextFinalized);
    socket.on("fill", onFill);
    socket.on("selection-cut", onSelectionCut);
    socket.on("paste-selection", onPasteSelection);
    socket.on("board-cleared", onBoardCleared);

    return () => {
      socket.off("draw", onDraw);
      socket.off("shape", onShape);
      socket.off("text", onText);
      socket.off("text-typing", onTextTyping);
      socket.off("text-finalized", onTextFinalized);
      socket.off("fill", onFill);
      socket.off("selection-cut", onSelectionCut);
      socket.off("paste-selection", onPasteSelection);
      socket.off("board-cleared", onBoardCleared);
    };
  }, [socket]);

  // Flush autosave before page unload
  useEffect(() => {
    const beforeUnload = () => {
      clearTimeout(autosaveTimerRef.current);
      autosaveToLocal();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // Focus text input when it appears
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  // Render other users' typing text on canvas overlay
  useEffect(() => {
    // This will re-render when activeTexts changes
  }, [activeTexts]);

  // Handle global mouse events for selection dragging
  useEffect(() => {
    if (!selectionDragging) return;

    const handleGlobalMove = (e) => {
      if (!selection) return;
      const curr = clientToLogical(e);
      const dx = curr.x - dragStart.current.x;
      const dy = curr.y - dragStart.current.y;
      setSelection((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      dragStart.current = curr;
    };

    const handleGlobalUp = () => {
      setSelectionDragging(false);
    };

    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleGlobalUp);
    window.addEventListener("touchmove", handleGlobalMove);
    window.addEventListener("touchend", handleGlobalUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMove);
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("touchmove", handleGlobalMove);
      window.removeEventListener("touchend", handleGlobalUp);
    };
  }, [selectionDragging, selection]);

  // Canvas setup and resize that does not wipe pixels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // NOTE(Tatiana): This was destroying drawings whenever iPad menus
    // opened/closed (resize). ChatGPT helped me only touch the backing
    // size when it actually changes and restore pixels from a snapshot.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctxRef.current = ctx;

    const applySizing = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      // Snapshot current pixels before any backing-store resize
      let snapshot = null;
      if (canvas.width && canvas.height) {
        try {
          snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch {
          // ignore
        }
      }

      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;

      const targetW = Math.round(VIRTUAL_WIDTH * dpr);
      const targetH = Math.round(VIRTUAL_HEIGHT * dpr);
      const sizeChanged = canvas.width !== targetW || canvas.height !== targetH;

      // Only reset backing size when it actually changes
      if (sizeChanged) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      // Draw in logical units and let DPR handle crispness
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;

      // If we changed backing size, restore the snapshot scaled back
      if (sizeChanged && snapshot) {
        try {
          const off = document.createElement("canvas");
          off.width = snapshot.width;
          off.height = snapshot.height;
          const offCtx = off.getContext("2d");
          offCtx.putImageData(snapshot, 0, 0);
          ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
          ctx.drawImage(
            off,
            0,
            0,
            off.width,
            off.height,
            0,
            0,
            VIRTUAL_WIDTH,
            VIRTUAL_HEIGHT
          );
        } catch {
          // ignore
        }
        // do not push history here, we did not change content, just restored it
      }

      // CSS size to fit wrapper with a small top padding
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();

      const padding = 20;
      const availableWidth = rect.width - padding * 2;
      const availableHeight = rect.height - padding * 2;

      const scale = Math.min(
        availableWidth / VIRTUAL_WIDTH,
        availableHeight / VIRTUAL_HEIGHT
      );
      const cssW = Math.max(1, Math.floor(VIRTUAL_WIDTH * scale));
      const cssH = Math.max(1, Math.floor(VIRTUAL_HEIGHT * scale));

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const left = Math.floor((rect.width - cssW) / 2);
      const top = padding;
      canvas.style.position = "absolute";
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      cssSizeRef.current = { width: cssW, height: cssH, left, top };

      if (!isInitialized.current) {
        isInitialized.current = true;
        loadSavedBoard();
      }
    };

    // Restore from local cache. Prefer specific key if present.
    // Skip if we already loaded from server or a peer.
    const loadSavedBoard = () => {
      if (hasLoadedContent.current) return;

      try {
        // Only load from board-specific cache
        if (!specificKey) return;
        const raw = localStorage.getItem(specificKey);
        if (!raw) return;

        const cached = JSON.parse(raw);
        const { img, bounds, vw, vh } = cached || {};
        if (!img || typeof img !== "string") return;

        const looksLegacy =
          Number(vw) !== VIRTUAL_WIDTH || Number(vh) !== VIRTUAL_HEIGHT;

        if (ref?.current?.loadFromDataURL) {
          ref.current.loadFromDataURL(img, looksLegacy ? null : bounds);
        } else {
          const image = new Image();
          image.src = img;
          image.onload = () => {
            const ctx = ctxRef.current;
            if (!ctx) return;
            ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
            if (!looksLegacy && bounds) {
              const bx = Math.max(
                0,
                Math.min(bounds.x, VIRTUAL_WIDTH - bounds.width)
              );
              const by = Math.max(
                0,
                Math.min(bounds.y, VIRTUAL_HEIGHT - bounds.height)
              );
              const bw = Math.min(bounds.width, VIRTUAL_WIDTH);
              const bh = Math.min(bounds.height, VIRTUAL_HEIGHT);
              ctx.drawImage(
                image,
                0,
                0,
                image.width,
                image.height,
                bx,
                by,
                bw,
                bh
              );
            } else {
              const cx = Math.max(
                0,
                Math.floor((VIRTUAL_WIDTH - image.width) / 2)
              );
              const cy = Math.max(
                0,
                Math.floor((VIRTUAL_HEIGHT - image.height) / 2)
              );
              ctx.drawImage(
                image,
                0,
                0,
                image.width,
                image.height,
                cx,
                cy,
                image.width,
                image.height
              );
            }
            pushHistory();
          };
        }
      } catch {
        // ignore bad cache
      }
    };

    // Debounced resize observer
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(applySizing, 80);
    };

    applySizing();
    const ro = new ResizeObserver(onResize);
    const el = wrapperRef.current;
    if (el) ro.observe(el);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [specificKey]);

  // === Late joiner sync (very small protocol fixed using ChatGPT) ===
  // When a new user joins, they "request-sync". Anyone alive replies
  // with a PNG snapshot so the joiner sees the board immediately.
  // (I added this so people don't stare at a blank while others are drawing.)
  useEffect(() => {
    if (!socket || !whiteboardId) return;

    const onRequestSync = ({ roomId }) => {
      if (roomId !== whiteboardId) return;
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const img = canvas.toDataURL("image/png");
        socket.emit("board:load-snapshot", { roomId: whiteboardId, img });
      } catch (e) {
        console.error("snapshot failed", e);
      }
    };

    const onLoadSnapshot = ({ roomId, img, bounds }) => {
      if (roomId !== whiteboardId || !img) return;
      hasLoadedContent.current = true;

      if (ref?.current?.loadFromDataURL) {
        ref.current.loadFromDataURL(
          img,
          bounds || { x: 0, y: 0, width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT }
        );
      } else {
        const image = new Image();
        image.src = img;
        image.onload = () => {
          const ctx = ctxRef.current;
          if (!ctx) return;
          ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
          ctx.drawImage(image, 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
          pushHistory();
        };
      }
    };

    socket.on("board:request-sync", onRequestSync);
    socket.on("board:load-snapshot", onLoadSnapshot);

    socket.emit("board:request-sync", { roomId: whiteboardId });

    return () => {
      socket.off("board:request-sync", onRequestSync);
      socket.off("board:load-snapshot", onLoadSnapshot);
    };
  }, [socket, whiteboardId, ref]);

  // Imperative API for parent components
  useImperativeHandle(ref, () => ({
    applyEvents(events) {
      const replay = (evs) => {
        if (!isInitialized.current) {
          setTimeout(() => replay(evs), REPLAY_RETRY_MS);
          return;
        }
        const ctx = ctxRef.current;
        if (!ctx || !Array.isArray(evs)) return;

        for (const ev of evs) {
          const { type, ...p } = ev || {};
          try {
            switch (type) {
              case "draw":
                if (!p.from || !p.to) break;
                ctx.save();
                ctx.globalCompositeOperation =
                  p.tool === "eraser" ? "destination-out" : "source-over";
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, p.strokeWidth || 1);
                stroke(ctx, p.from, p.to);
                ctx.restore();
                break;
              case "shape":
                if (!p.from || !p.to) break;
                ctx.save();
                ctx.globalCompositeOperation = "source-over";
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, p.strokeWidth || 1);
                drawShape[p.tool]?.(ctx, p.from, p.to);
                ctx.restore();
                break;
              case "text":
                if (typeof p.x !== "number" || typeof p.y !== "number") break;
                ctx.save();
                ctx.globalCompositeOperation = "source-over";
                ctx.fillStyle = p.color || "#000";
                {
                  const px = Math.max(10, Math.round((p.strokeWidth || 2) * 10));
                  ctx.font = `${px}px Arial`;
                }
                ctx.textBaseline = "top";
                ctx.fillText(p.text || "", p.x, p.y);
                ctx.restore();
                break;
              case "fill":
                if (typeof p.x !== "number" || typeof p.y !== "number") break;
                floodFill(ctx, p.x, p.y, p.color || "#000");
                break;
              default:
                break;
            }
          } catch (err) {
            console.error("canvas: replay error", err);
          }
        }
        pushHistory();
      };

      replay(events);
    },

    clear() {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      ctx.restore();
      pushHistory();
      if (socket && whiteboardId) {
        socket.emit("board-cleared", { roomId: whiteboardId });
      }
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

    // Save to our server API with cropped transparent PNG (no white box).
    // (JPEG was causing white background before; fixed with ChatGPT.)
    async save() {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      try {
        const bounds = getContentBoundsLogical();
        let dataURL;
        let savedBounds = null;

        if (bounds && bounds.width > 0 && bounds.height > 0) {
          const temp = document.createElement("canvas");
          temp.width = Math.round(bounds.width);
          temp.height = Math.round(bounds.height);
          const tctx = temp.getContext("2d");
          if (tctx) {
            const dpr = dprRef.current || 1;
            tctx.drawImage(
              canvas,
              Math.round(bounds.x * dpr),
              Math.round(bounds.y * dpr),
              Math.round(bounds.width * dpr),
              Math.round(bounds.height * dpr),
              0,
              0,
              temp.width,
              temp.height
            );
            dataURL = temp.toDataURL("image/png");
            savedBounds = { ...bounds };
          } else {
            dataURL = canvas.toDataURL("image/png");
          }
        } else {
          const t = document.createElement("canvas");
          t.width = 1;
          t.height = 1;
          dataURL = t.toDataURL("image/png");
          savedBounds = { x: 0, y: 0, width: 1, height: 1 };
        }

        if (whiteboardId && sessionToken) {
          const res = await fetch(
            `${API_URL}/api/whiteboards/${whiteboardId}/canvas`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
              },
              body: JSON.stringify({ canvasImage: dataURL, bounds: savedBounds }),
            }
          );

          if (!res.ok) {
            let msg = `${res.status}: ${res.statusText}`;
            try {
              const j = await res.json();
              if (j?.error) msg = j.error;
            } catch {}
            throw new Error(msg);
          }

          const out = await res.json();
          alert(`Saved to server! (${out.sizeMB ?? "OK"})`);
          if (socket && whiteboardId) {
            socket.emit("board-saved", { roomId: whiteboardId });
          }
        } else {
          alert("Cannot save: No server connection or session.");
        }
      } catch (err) {
        console.error("canvas: save failed", err);
        alert(`Save failed: ${err.message}`);
      }
    },

    exportPNG() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = whiteboardId
        ? `whiteboard-${whiteboardId}-${ts}.png`
        : `whiteboard-${ts}.png`;
      a.download = filename;
      a.href = canvas.toDataURL("image/png");
      a.click();
    },

    loadFromDataURL(dataURL, bounds) {
      if (!dataURL || typeof dataURL !== "string") return;

      hasLoadedContent.current = true;

      const img = new Image();
      img.src = dataURL;

      img.onload = () => {
        const ctx = ctxRef.current;
        if (!ctx) return;

        ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

        if (
          bounds &&
          Number.isFinite(bounds.x) &&
          Number.isFinite(bounds.y) &&
          Number.isFinite(bounds.width) &&
          Number.isFinite(bounds.height)
        ) {
          let bx = bounds.x;
          let by = bounds.y;
          let bw = bounds.width;
          let bh = bounds.height;

          const looksPhysical =
            bx > VIRTUAL_WIDTH ||
            by > VIRTUAL_HEIGHT ||
            bw > VIRTUAL_WIDTH ||
            bh > VIRTUAL_HEIGHT;

          if (looksPhysical) {
            const cx = Math.max(
              0,
              Math.floor((VIRTUAL_WIDTH - img.width) / 2)
            );
            const cy = Math.max(
              0,
              Math.floor((VIRTUAL_HEIGHT - img.height) / 2)
            );
            ctx.drawImage(
              img,
              0,
              0,
              img.width,
              img.height,
              cx,
              cy,
              img.width,
              img.height
            );
          } else {
            bw = Math.min(bw, VIRTUAL_WIDTH);
            bh = Math.min(bh, VIRTUAL_HEIGHT);
            bx = Math.max(0, Math.min(bx, VIRTUAL_WIDTH - bw));
            by = Math.max(0, Math.min(by, VIRTUAL_HEIGHT - bh));

            ctx.drawImage(
              img,
              0,
              0,
              img.width,
              img.height,
              bx,
              by,
              bw,
              bh
            );
          }
        } else {
          ctx.drawImage(img, 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        }

        pushHistory();
      };

      img.onerror = () => console.error("canvas: bad dataURL");
    },

    loadElements(elements) {
      const ctx = ctxRef.current;
      if (!ctx || !Array.isArray(elements)) return;

      hasLoadedContent.current = true;

      for (const el of elements) {
        try {
          const w = Math.max(1, Number(el.strokeWidth) || 1);
          ctx.save();
          ctx.globalCompositeOperation =
            el.tool === "eraser" ? "destination-out" : "source-over";
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
              break;
          }
          ctx.restore();
        } catch (err) {
          console.error("canvas: loadElements draw error", err);
        }
      }
      pushHistory();
    },
  }));

  // Pointer handlers: produce logical coords and emit normalized events
  const onPointerDown = (e) => {
    if (!ctxRef.current || !isInitialized.current) return;

    const clickPos = clientToLogical(e);

    // If there's an active selection, clicking on canvas pastes it
    if (selection) {
      pasteSelection();
      // Don't start drawing after pasting
      return;
    }

    setIsDrawing(true);
    dragStart.current = clickPos;

    if (selectedTool === "text") {
      // Start text input at click position
      textInputCreatedTime.current = Date.now();
      setTextInput({
        x: dragStart.current.x,
        y: dragStart.current.y,
        text: "",
      });
      setIsDrawing(false);
      return;
    }

    if (selectedTool === "fill") {
      const ctx = ctxRef.current;
      if (!ctx) return;
      console.log("Filling locally and emitting to socket:", {
        roomId: whiteboardId,
        x: dragStart.current.x,
        y: dragStart.current.y,
        color,
        socketConnected: socket?.connected,
        socketId: socket?.id,
      });
      floodFill(ctx, dragStart.current.x, dragStart.current.y, color);
      pushHistory();
      if (socket && whiteboardId) {
        console.log("Socket state before emit:", {
          connected: socket.connected,
          id: socket.id,
          roomId: whiteboardId
        });
        socket.emit("fill", {
          roomId: whiteboardId,
          x: dragStart.current.x,
          y: dragStart.current.y,
          color,
        });
        console.log("Fill event emitted to server");
      } else {
        console.log("No socket or whiteboardId!", { socket: !!socket, whiteboardId });
      }
      setIsDrawing(false);
      return;
    }

    // Selection tools
    if (selectedTool === "select-rect") {
      // Start rectangular selection
      return;
    }

    if (selectedTool === "lasso") {
      // Start lasso selection
      setLassoPath([dragStart.current]);
      return;
    }

    if (drawShape[selectedTool]) {
      const c = canvasRef.current;
      const ctx = ctxRef.current;
      if (!c || !ctx) return;
      try {
        previewSnapshot.current = ctx.getImageData(0, 0, c.width, c.height);
      } catch (err) {
        console.error("canvas: preview snapshot fail", err);
      }
    }
  };

  const onPointerMove = (e) => {
    if (!ctxRef.current) return;
    const curr = clientToLogical(e);

    // Handle selection dragging
    if (selectionDragging && selection) {
      const dx = curr.x - dragStart.current.x;
      const dy = curr.y - dragStart.current.y;
      setSelection((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      dragStart.current = curr;
      return;
    }

    if (!isDrawing) return;
    const ctx = ctxRef.current;

    if (selectedTool === "pen" || selectedTool === "eraser") {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = selectedTool === "eraser" ? strokeWidth * 3 : strokeWidth;
      ctx.globalCompositeOperation =
        selectedTool === "eraser" ? "destination-out" : "source-over";
      stroke(ctx, dragStart.current, curr);
      ctx.restore();

      if (socket && whiteboardId)
        socket.emit("draw", {
          roomId: whiteboardId,
          tool: selectedTool,
          from: dragStart.current,
          to: curr,
          color,
          strokeWidth:
            selectedTool === "eraser" ? strokeWidth * 3 : strokeWidth,
        });

      dragStart.current = curr;
      return;
    }

    if (selectedTool === "lasso" && lassoPath.length > 0) {
      // Add point to lasso path
      setLassoPath((prev) => [...prev, curr]);
      return;
    }

    if (previewSnapshot.current && drawShape[selectedTool]) {
      ctx.putImageData(previewSnapshot.current, 0, 0);

      // Set up the drawing style for preview
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawShape[selectedTool](ctx, dragStart.current, curr);
      ctx.restore();
    }
  };

  const onPointerUp = (e) => {
    // Handle selection drag end
    if (selectionDragging) {
      setSelectionDragging(false);
      return;
    }

    if (!ctxRef.current) return;
    if (!isDrawing) return;
    setIsDrawing(false);

    const ctx = ctxRef.current;
    const curr = clientToLogical(e);

    // Handle rectangular selection
    if (selectedTool === "select-rect") {
      const x = Math.min(dragStart.current.x, curr.x);
      const y = Math.min(dragStart.current.y, curr.y);
      const width = Math.abs(curr.x - dragStart.current.x);
      const height = Math.abs(curr.y - dragStart.current.y);

      if (width > 5 && height > 5) {
        cutSelection(x, y, width, height);
      }
      return;
    }

    // Handle lasso selection
    if (selectedTool === "lasso" && lassoPath.length > 2) {
      cutLassoSelection(lassoPath);
      setLassoPath([]);
      return;
    }

    if (drawShape[selectedTool]) {
      if (previewSnapshot.current) ctx.putImageData(previewSnapshot.current, 0, 0);

      // Set up the drawing style for final shape
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawShape[selectedTool](ctx, dragStart.current, curr);
      ctx.restore();

      if (socket && whiteboardId)
        socket.emit("shape", {
          roomId: whiteboardId,
          tool: selectedTool,
          from: dragStart.current,
          to: curr,
          color,
          strokeWidth,
        });

      previewSnapshot.current = null;
    }

    pushHistory();
    ctx.globalCompositeOperation = "source-over";
  };

  // Paste selection to canvas
  const pasteSelection = () => {
    if (!selection) return;

    const ctx = ctxRef.current;
    if (!ctx) return;

    try {
      const dpr = dprRef.current || 1;
      const { x, y, imageData, width, height } = selection;

      // Create temporary canvas with the imageData
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.putImageData(imageData, 0, 0);

      // Use drawImage to paste with proper alpha compositing
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(
        tempCanvas,
        0,
        0,
        imageData.width,
        imageData.height,
        x,
        y,
        width,
        height
      );
      ctx.restore();

      setSelection(null);
      pushHistory();

      // Emit to other users
      if (socket && whiteboardId) {
        const dataURL = tempCanvas.toDataURL("image/png");

        socket.emit("paste-selection", {
          roomId: whiteboardId,
          x,
          y,
          width,
          height,
          dataURL,
        });
      }
    } catch (err) {
      console.error("Paste selection error:", err);
    }
  };

  // Convert logical coordinates to CSS pixel coordinates on screen
  const logicalToScreen = (lx, ly) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cssSize = cssSizeRef.current;

    const x = (lx / VIRTUAL_WIDTH) * cssSize.width + cssSize.left;
    const y = (ly / VIRTUAL_HEIGHT) * cssSize.height + cssSize.top;

    return { x, y };
  };

  // Render
  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full max-h-full overflow-hidden"
      style={{ backgroundColor: "#e5e7eb" }}
    >
      {gridEnabled && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            opacity: 0.4,
            zIndex: 0,
          }}
        />
      )}

      {/* White background div behind transparent canvas */}
      <div
        className="absolute z-5"
        style={{
          left: `${cssSizeRef.current.left}px`,
          top: `${cssSizeRef.current.top}px`,
          width: `${cssSizeRef.current.width}px`,
          height: `${cssSizeRef.current.height}px`,
          backgroundColor: "#ffffff",
          borderRadius: "4px",
          boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 20px rgba(0, 0, 0, 0.08)",
        }}
      />

      <canvas
        ref={canvasRef}
        className="block z-10"
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
              : selectedTool === "fill"
              ? "pointer"
              : selectedTool === "select-rect" || selectedTool === "lasso"
              ? "crosshair"
              : "crosshair",
          touchAction: "none",
          borderRadius: "4px",
        }}
      />

      {/* Text input overlay for current user */}
      {textInput && (() => {
        const pos = logicalToScreen(textInput.x, textInput.y);
        return (
          <input
            ref={textInputRef}
            type="text"
            value={textInput.text}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            onBlur={(e) => {
              // Use setTimeout to allow clicking on the input without immediate blur
              setTimeout(() => finalizeTextInput(), 150);
            }}
            className="absolute z-20 border-b-2 border-blue-500 outline-none"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              color: color,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              fontSize: `${Math.max(10, Math.round(strokeWidth * 10))}px`,
              fontFamily: "Arial",
              minWidth: "100px",
              padding: "2px 4px",
            }}
            autoFocus
            placeholder="Type text..."
          />
        );
      })()}

      {/* Show other users' typing text */}
      {activeTexts.map((txt, idx) => (
        <div
          key={`${txt.userId}-${idx}`}
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${logicalToScreen(txt.x, txt.y).x}px`,
            top: `${logicalToScreen(txt.x, txt.y).y}px`,
            color: txt.color || "#000",
            fontSize: `${Math.max(10, Math.round((txt.strokeWidth || 2) * 10))}px`,
            fontFamily: "Arial",
            opacity: 0.7,
            borderBottom: "2px dashed rgba(100, 100, 100, 0.5)",
          }}
        >
          {txt.text}
        </div>
      ))}

      {/* Show selection preview */}
      {selection && (() => {
        const pos = logicalToScreen(selection.x, selection.y);
        const size = {
          width: (selection.width / VIRTUAL_WIDTH) * cssSizeRef.current.width,
          height: (selection.height / VIRTUAL_HEIGHT) * cssSizeRef.current.height,
        };

        // Render selection imageData as preview
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = selection.imageData.width;
        tempCanvas.height = selection.imageData.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.putImageData(selection.imageData, 0, 0);
        const dataURL = tempCanvas.toDataURL("image/png");

        return (
          <div
            className="absolute z-30 border-2 border-dashed border-blue-500"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              width: `${size.width}px`,
              height: `${size.height}px`,
              backgroundImage: `url(${dataURL})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "0 0",
              cursor: selectionDragging ? "grabbing" : "grab",
              pointerEvents: "auto",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setSelectionDragging(true);
              dragStart.current = clientToLogical(e);
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              setSelectionDragging(true);
              dragStart.current = clientToLogical(e);
            }}
          >
            <div className="absolute -bottom-6 left-0 text-xs bg-blue-500 text-white px-2 py-1 rounded whitespace-nowrap pointer-events-none">
              Drag to move - Click outside to paste
            </div>
          </div>
        );
      })()}

      {/* Show lasso path while drawing - positioned relative to wrapper */}
      {lassoPath.length > 0 && selectedTool === "lasso" && !selection && (
        <svg
          className="absolute pointer-events-none z-25"
          style={{
            left: 0,
            top: 0,
            width: `${cssSizeRef.current.width + cssSizeRef.current.left}px`,
            height: `${cssSizeRef.current.height + cssSizeRef.current.top}px`,
          }}
        >
          <path
            d={
              lassoPath.length > 0
                ? `M ${lassoPath.map((p) => {
                    const pos = logicalToScreen(p.x, p.y);
                    return `${pos.x},${pos.y}`;
                  }).join(" L ")} Z`
                : ""
            }
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="rgba(59, 130, 246, 0.1)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
});

export default CanvasBoard;

// Reference for event flow structure:
// https://github.com/socketio/socket.io/tree/main/examples/whiteboard
