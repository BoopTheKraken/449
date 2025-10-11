import { useState, useRef, useEffect } from "react";
import CanvasBoard from "../components/CanvasBoard";

export default function Whiteboard() {
  const [selectedTool, setSelectedTool] = useState("pen");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);

  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(true);

  // Presence is a UI hint for now; wire to server presence later
  const [userCount, setUserCount] = useState(1);

  // Access CanvasBoard methods (undo/redo/save/export)
  const canvasBoardRef = useRef(null);

  // quick palette
  const colors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#6D94C5"];

  // Keyboard shortcuts (skip when typing in inputs)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key.toLowerCase()) {
        case "p":
          setSelectedTool("pen");
          break;
        case "e":
          setSelectedTool("eraser");
          break;
        case "r":
          setSelectedTool("rectangle");
          break;
        case "c":
          if (!e.ctrlKey && !e.metaKey) setSelectedTool("circle"); // don’t steal copy
          break;
        case "l":
          setSelectedTool("line");
          break;
        case "t":
          setSelectedTool("text");
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? canvasBoardRef.current?.redo() : canvasBoardRef.current?.undo();
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            canvasBoardRef.current?.redo();
          }
          break;
        case "s":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault(); // take over browser Save dialog
            canvasBoardRef.current?.save();
          }
          break;
        case "[":
          setStrokeWidth((v) => Math.max(1, v - 1));
          break;
        case "]":
          setStrokeWidth((v) => Math.min(20, v + 1));
          break;
        case "escape":
          setShowChat(false);
          setShowSettings(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Presence hook placeholder (will listen to CanvasBoard/Socket context)
  useEffect(() => {
    // TODO(Tatiana): subscribe to presence events (e.g., window.addEventListener('wb:presence', ...))
    // or lift the socket into context so this component can read user counts directly.
  }, []);

  // simple load (for now relies on page reload)
  const handleLoad = () => {
    const saved = localStorage.getItem("whiteboard-save");
    if (saved) {
      // TODO(Tatiana): expose canvasBoardRef.current.load(dataURL) to avoid full reload
      window.location.reload();
    } else {
      alert("No saved board found!");
    }
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col bg-gray-50">
      {/* toolbar */}
      <div className="bg-white border-b shadow-sm p-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* drawing tools */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => setSelectedTool("pen")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "pen" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Pen (P)"
                aria-label="Pen"
              >
                <i className="fa-solid fa-pencil" />
              </button>
              <button
                onClick={() => setSelectedTool("eraser")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "eraser" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Eraser (E)"
                aria-label="Eraser"
              >
                <i className="fa-solid fa-eraser" />
              </button>
              <button
                onClick={() => setSelectedTool("rectangle")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "rectangle" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Rectangle (R)"
                aria-label="Rectangle"
              >
                <i className="fa-regular fa-square" />
              </button>
              <button
                onClick={() => setSelectedTool("circle")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "circle" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Circle (C)"
                aria-label="Circle"
              >
                <i className="fa-regular fa-circle" />
              </button>
              <button
                onClick={() => setSelectedTool("line")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "line" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Line (L)"
                aria-label="Line"
              >
                <i className="fa-solid fa-slash" />
              </button>
              <button
                onClick={() => setSelectedTool("text")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "text" ? "bg-primary text-white shadow-md scale-105" : "hover:bg-light-blue text-gray-700"
                }`}
                title="Text (T)"
                aria-label="Text"
              >
                <i className="fa-solid fa-font" />
              </button>
            </div>

            {/* colors */}
            <div className="flex items-center gap-1 bg-cream rounded-lg p-2">
              <i className="fa-solid fa-palette text-gray-600 mr-1" aria-hidden="true" />
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-200 hover:scale-110 ${
                    color === c ? "border-gray-800 shadow-md scale-110" : "border-gray-300"
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Color: ${c}`}
                  aria-label={`Set color ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer hover:scale-110 transition-transform"
                title="Custom Color"
                aria-label="Custom color"
              />
              {/* TODO(Tatiana): debounce color picker on touch; drag can spam change events */}
            </div>

            {/* stroke size */}
            <div className="flex items-center gap-2 bg-cream rounded-lg px-3 py-2">
              <button
                onClick={() => setStrokeWidth((v) => Math.max(1, v - 1))}
                className="text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
                disabled={strokeWidth <= 1}
                title="Decrease Size"
                aria-label="Decrease stroke"
              >
                <i className="fa-solid fa-minus" />
              </button>
              <div className="flex items-center gap-1">
                <div
                  className="w-4 h-4 rounded-full bg-current"
                  style={{
                    width: `${Math.min(16, strokeWidth * 2)}px`,
                    height: `${Math.min(16, strokeWidth * 2)}px`,
                    backgroundColor: color,
                  }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium w-8 text-center">{strokeWidth}px</span>
              </div>
              <button
                onClick={() => setStrokeWidth((v) => Math.min(20, v + 1))}
                className="text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
                disabled={strokeWidth >= 20}
                title="Increase Size"
                aria-label="Increase stroke"
              >
                <i className="fa-solid fa-plus" />
              </button>
            </div>
          </div>

          {/* actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => canvasBoardRef.current?.undo()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <i className="fa-solid fa-rotate-left" />
              </button>
              <button
                onClick={() => canvasBoardRef.current?.redo()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <i className="fa-solid fa-rotate-right" />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-300" />

            <button
              onClick={() => {
                if (window.confirm("Clear the entire board? This cannot be undone.")) {
                  canvasBoardRef.current?.clear();
                }
              }}
              className="p-2 rounded hover:bg-red-100 text-red-600 transition-colors"
              title="Clear Board"
              aria-label="Clear board"
            >
              <i className="fa-solid fa-trash" />
            </button>

            <div className="w-px h-6 bg-gray-300" />

            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => canvasBoardRef.current?.save()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Save Board"
                aria-label="Save board"
              >
                <i className="fa-solid fa-floppy-disk" />
              </button>
              <button
                onClick={handleLoad}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Load Board"
                aria-label="Load board"
              >
                <i className="fa-solid fa-folder-open" />
              </button>
              <button
                onClick={() => canvasBoardRef.current?.exportPNG()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Export as PNG"
                aria-label="Export as PNG"
              >
                <i className="fa-solid fa-file-export" />
              </button>
              {/* TODO(Tatiana): add SVG export (nice for docs) */}
            </div>

            <div className="w-px h-6 bg-gray-300" />

            <button
              onClick={() => setShowChat((v) => !v)}
              className={`p-2 rounded transition-colors relative ${
                showChat ? "bg-primary text-white" : "hover:bg-light-blue text-gray-700"
              }`}
              title="Toggle Chat"
              aria-label="Toggle chat"
            >
              <i className="fa-solid fa-comments" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded transition-colors ${
                showSettings ? "bg-primary text-white" : "hover:bg-light-blue text-gray-700"
              }`}
              title="Settings"
              aria-label="Open settings"
            >
              <i className="fa-solid fa-gear" />
            </button>
          </div>
        </div>

        {/* status bar */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Connected
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-users" />
              {userCount} {userCount === 1 ? "user" : "users"} online
              {/* TODO(Tatiana): swap to real presence once rooms are live */}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 capitalize">
              <i
                className={`fa-solid ${
                  selectedTool === "pen"
                    ? "fa-pencil"
                    : selectedTool === "eraser"
                    ? "fa-eraser"
                    : selectedTool === "rectangle"
                    ? "fa-square"
                    : selectedTool === "circle"
                    ? "fa-circle"
                    : selectedTool === "line"
                    ? "fa-slash"
                    : "fa-font"
                }`}
              />
              {selectedTool}
            </span>
            <span className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full border border-gray-400"
                style={{ backgroundColor: color }}
              />
              {strokeWidth}px
            </span>
          </div>
        </div>
      </div>

      {/* main */}
      <div className="flex-1 relative flex">
        {/* canvas */}
        <CanvasBoard
          ref={canvasBoardRef}
          selectedTool={selectedTool}
          color={color}
          strokeWidth={strokeWidth}
          // TODO(Tatiana): pass gridEnabled down once CanvasBoard toggles the grid layer
          // gridEnabled={gridEnabled}
          // TODO(Tatiana): when rooms exist, pass whiteboardId/userId so CanvasBoard can join
        />

        {/* chat shell (Socket wiring later) */}
        {showChat && (
          <div className="w-80 bg-white border-l shadow-lg flex flex-col animate-in slide-in-from-right">
            <div className="p-3 border-b bg-cream flex justify-between items-center">
              <h3 className="font-semibold text-gray-700">Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close chat"
              >
                <i className="fa-solid fa-times" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
              <div className="space-y-3">
                <div className="text-gray-500 text-sm text-center py-8">
                  <i className="fa-regular fa-comments text-3xl mb-2" />
                  <p>No messages yet</p>
                  <p className="text-xs mt-1">Start a conversation!</p>
                </div>
              </div>
            </div>
            <div className="p-3 border-t bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  onKeyDown={(e) => e.key === "Enter" && console.log("Send message")}
                  aria-label="Chat message"
                />
                <button
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                  aria-label="Send message"
                >
                  <i className="fa-solid fa-paper-plane" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* settings */}
        {showSettings && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-start justify-end p-4 z-20">
            <div className="w-80 bg-white rounded-lg shadow-xl p-4 mt-16 animate-in slide-in-from-top">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-700 text-lg">Settings</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Close settings"
                >
                  <i className="fa-solid fa-times" />
                </button>
              </div>

              <div className="space-y-4">
                {/* board */}
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Board</h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={gridEnabled}
                        onChange={(e) => setGridEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Show grid</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm">Auto-save enabled</span>
                      {/* TODO(Tatiana): add an autosave interval that calls save silently */}
                    </label>
                  </div>
                </div>

                {/* shortcuts */}
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Keyboard Shortcuts</h4>
                  <div className="text-xs space-y-1 text-gray-500">
                    <KbRow v="Pen" k="P" />
                    <KbRow v="Eraser" k="E" />
                    <KbRow v="Rectangle" k="R" />
                    <KbRow v="Circle" k="C" />
                    <KbRow v="Line" k="L" />
                    <KbRow v="Text" k="T" />
                    <KbRow v="Undo" k="Ctrl+Z" />
                    <KbRow v="Redo" k="Ctrl+Y / Shift+Ctrl+Z" />
                    <KbRow v="Save" k="Ctrl+S" />
                    <KbRow v="Decrease Size" k="[" />
                    <KbRow v="Increase Size" k="]" />
                    <KbRow v="Close Chat/Settings" k="Esc" />
                  </div>
                </div>

                {/* about */}
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">About</h4>
                  <p className="text-xs text-gray-500">
                    Real-time Collaborative Whiteboard v1.0
                    <br />
                    CPSC449 Project
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// tiny helper for shortcuts list
function KbRow({ k, v }) {
  return (
    <div className="flex justify-between">
      <span>{v}</span>
      <kbd className="px-1 py-0.5 bg-gray-100 rounded">{k}</kbd>
    </div>
  );
}
