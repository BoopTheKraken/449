import { useState, useRef, useEffect } from "react";
import { supabase } from "../config/supabaseClient";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import CanvasBoard from "../components/CanvasBoard";
import { API_URL } from "../utils/api";

export default function Whiteboard() {
  // route
  const { id: whiteboardId } = useParams();
  const navigate = useNavigate();

  // auth
  const { session } = useAuth();

  // drawing state
  const [selectedTool, setSelectedTool] = useState("pen");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);

  // page state
  const [whiteboardTitle, setWhiteboardTitle] = useState("Untitled Whiteboard");
  const [loading, setLoading] = useState(true);

  // panels
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(true);

  // chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [userCount, setUserCount] = useState(1);
  const [isTyping, setIsTyping] = useState(null); // who is typing

  // refs
  const socketRef = useRef(null);
  const [socketState, setSocketState] = useState(null);
  const canvasBoardRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // quick palette (simple defaults)
  const colors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#6D94C5"];

  // load whiteboard (title + elements + saved canvas) once we have id
  // Note: Priority logic - compare localStorage vs server timestamps (fixed using ChatGPT)
  useEffect(() => {
    const loadWhiteboard = async () => {
      if (!whiteboardId) {
        navigate("/dashboard");
        return;
      }

      try {
        setLoading(true);
        const token = session?.access_token;
        const res = await fetch(`${API_URL}/api/whiteboards/${whiteboardId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) throw new Error("Failed to load whiteboard");

        const data = await res.json();
        setWhiteboardTitle(data.whiteboard?.title || "Untitled Whiteboard");

        // Check localStorage for cached content (board-specific only)
        const specificKey = `whiteboard-cache-${whiteboardId}`;
        let localCache = null;
        try {
          const rawSpecific = localStorage.getItem(specificKey);
          if (rawSpecific) {
            localCache = JSON.parse(rawSpecific);
          }
        } catch (e) {
          console.warn("Failed to parse localStorage cache:", e);
        }

        // Get server timestamp (from whiteboard lastModified)
        const serverTimestamp = data.whiteboard?.lastModified
          ? new Date(data.whiteboard.lastModified).getTime()
          : 0;

        // Get local cache timestamp
        const localTimestamp = localCache?.ts || 0;

        // Priority 1: Use localStorage if it's newer than server
        if (localCache && localTimestamp > serverTimestamp) {
          console.log("Loading from localStorage (newer than server)");
          canvasBoardRef.current?.loadFromDataURL(
            localCache.img,
            localCache.bounds
          );
        }
        // Priority 2: Load server-saved canvas image if it exists
        else if (data.whiteboard?.canvasImage) {
          console.log("Loading server-saved canvas image");
          canvasBoardRef.current?.loadFromDataURL(
            data.whiteboard.canvasImage,
            data.whiteboard.canvasBounds
          );
        }
        // Priority 3: Load individual elements if no canvas image saved (old behavior)
        else if (Array.isArray(data.elements) && data.elements.length > 0) {
          console.log("Loading canvas from individual elements");
          canvasBoardRef.current?.loadElements(data.elements);
        }
        // Priority 4: Load from localStorage even if server had nothing
        else if (localCache) {
          console.log("Loading from localStorage (server has no content)");
          canvasBoardRef.current?.loadFromDataURL(
            localCache.img,
            localCache.bounds
          );
        }
      } catch (err) {
        console.error("Load whiteboard error:", err);
        alert("Failed to load whiteboard. Redirecting to dashboard...");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadWhiteboard();
  }, [whiteboardId, session, navigate]);

  // Socket.IO setup + room join
  useEffect(() => {
    if (!session?.access_token) {
      setConnected(false);
      return;
    }

    const token = session.access_token;

    // connect (auth passed via handshake)
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    socketRef.current = socket;
    setSocketState(socket);

    socket.on("connect", () => {
      console.log('Socket connected:', socket.id);
      setConnected(true);
      console.log('Joining room:', whiteboardId);
      socket.emit("join", { roomId: whiteboardId }); // join room
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setSocketState(null);
    });

    // room meta (user count, list)
    socket.on("room-info", ({ userCount: count, users }) => {
      if (typeof count === "number") setUserCount(count);
      if (Array.isArray(users)) setActiveUsers(users);
    });

    // get chat messages from Supabase
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
        .from('Chat_Messages')
        .select('*')
        .eq('whiteboard_id', whiteboardId)
        .order('time_stamp', { ascending: true });
  
        if (error) {
          console.error('Error fetching messages: ', error);
        }

        const formattedMessages = await Promise.all(
          data.map(async (msg) => {
            let username = "Guest";

            try {

              const { data: users } = await supabase
                .from('Users')
                .select('username, first_name, last_name')
                .eq('user_id', msg.user_id)
                .single();

                const full_name = users.first_name + " " + users.last_name
                username = users?.username || full_name || users?.first_name
            } catch (error) {
              username = msg.user_id?.substring(0, 8) || 'Guest';
            }

            return {
              text: msg.message,
              user: username,
              timestamp: msg.time_stamp,
              type: 'message'
          };
      })
    );

        setChatMessages(formattedMessages);
        } catch (error) {
        console.error('Exception: ', error);
      }
    }
  
    if (whiteboardId) {
      fetchMessages();
    }

    // chat messages
    socket.on("chatMessage", async (msg) => {
      if (!msg || typeof msg !== "object") return;
      setChatMessages((prev) => [...prev, msg]);

      // save chat messages to supabase
      try {
        // get the current user
        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase
        .from('Chat_Messages')
        .insert([
          { 
            user_id: user.id,
            whiteboard_id: whiteboardId, 
            message: msg.text
          }
        ])

        //console.log(whiteboardId);
        if (error) {
          console.error('Error saving message:', error)
        } else {
          console.log('Message saved successfully: ', data)
        }
      } catch (error) {
        console.error('Exception', error)
      }
    });

    // typing indicator
    socket.on("typing", ({ userName, isTyping }) => {
      if (isTyping) {
        setIsTyping(userName || "Someone");
        clearTimeout(typingTimeoutRef.current);
        // auto clear after 2s (optimized using ChatGPT)
        typingTimeoutRef.current = setTimeout(() => setIsTyping(null), 2000);
      } else {
        setIsTyping(null);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err?.message || err);
      setConnected(false);
    });

    return () => {
      clearTimeout(typingTimeoutRef.current);
      socket.off();
      socket.disconnect();
    };
  }, [session, whiteboardId]);

  // auto scroll chat down
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // send chat
  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || !socketRef.current?.connected) return;

    socketRef.current.emit("chatMessage", { roomId: whiteboardId, text });
    setChatInput("");
    socketRef.current.emit("typing", { roomId: whiteboardId, isTyping: false });
  };

  // typing
  const handleChatInput = (e) => {
    const value = e.target.value;
    setChatInput(value);
    if (!socketRef.current?.connected) return;
    socketRef.current.emit("typing", {
      roomId: whiteboardId,
      isTyping: value.length > 0,
    });
  };

  // keyboard shortcuts (common drawing hotkeys)
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
          if (!e.ctrlKey && !e.metaKey) setSelectedTool("circle");
          break;
        case "l":
          setSelectedTool("line");
          break;
        case "t":
          setSelectedTool("text");
          break;
        case "f":
          setSelectedTool("fill");
          break;
        case "s":
          setSelectedTool("select-rect");
          break;
        case "a":
          setSelectedTool("lasso");
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey
              ? canvasBoardRef.current?.redo()
              : canvasBoardRef.current?.undo();
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
            e.preventDefault();
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

  // load from localStorage (manual trigger)
  const handleLoad = () => {
    const saved = localStorage.getItem(`whiteboard-save-${whiteboardId}`);
    if (saved) {
      canvasBoardRef.current?.loadFromDataURL(saved);
    } else {
      alert("No saved board found.");
    }
  };

  // share session id
  const shareSessionId = () => {
    navigator.clipboard
      .writeText(whiteboardId)
      .then(() => {
        alert(
          `Session ID copied to clipboard: ${whiteboardId}\nShare this ID with others to collaborate!`
        );
      })
      .catch(() => {
        alert(
          `Session ID: ${whiteboardId}\nShare this ID with others to collaborate!`
        );
      });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading whiteboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top toolbar */}
      <div className="bg-white border-b shadow-sm p-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* title + back */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded hover:bg-gray-100 text-gray-600"
              title="Back to Dashboard"
            >
              <i className="fa-solid fa-arrow-left"></i>
            </button>
            <div>
              <h2 className="font-semibold text-lg text-gray-800">
                {whiteboardTitle}
              </h2>
              <p className="text-xs text-gray-500 font-mono">
                Session: {whiteboardId}
              </p>
            </div>
          </div>

          {/* tools */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => setSelectedTool("pen")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "pen"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Pen (P)"
              >
                <i className="fa-solid fa-pencil" />
              </button>

              <button
                onClick={() => setSelectedTool("eraser")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "eraser"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Eraser (E)"
              >
                <i className="fa-solid fa-eraser" />
              </button>

              <button
                onClick={() => setSelectedTool("rectangle")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "rectangle"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Rectangle (R)"
              >
                <i className="fa-regular fa-square" />
              </button>

              <button
                onClick={() => setSelectedTool("circle")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "circle"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Circle (C)"
              >
                <i className="fa-regular fa-circle" />
              </button>

              <button
                onClick={() => setSelectedTool("line")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "line"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Line (L)"
              >
                <i className="fa-solid fa-slash" />
              </button>

              <button
                onClick={() => setSelectedTool("text")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "text"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Text (T)"
              >
                <i className="fa-solid fa-font" />
              </button>

              <button
                onClick={() => setSelectedTool("fill")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "fill"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Fill Bucket (F)"
              >
                <i className="fa-solid fa-fill-drip" />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-300" />

            {/* Selection tools */}
            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => setSelectedTool("select-rect")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "select-rect"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Rectangular Select (S)"
              >
                <i className="fa-regular fa-square-dashed" />
              </button>

              <button
                onClick={() => setSelectedTool("lasso")}
                className={`p-2 rounded transition-all duration-200 ${
                  selectedTool === "lasso"
                    ? "bg-primary text-white shadow-md scale-105"
                    : "hover:bg-light-blue text-gray-700"
                }`}
                title="Lasso Select (A)"
              >
                <i className="fa-solid fa-draw-polygon" />
              </button>
            </div>

            {/* colors */}
            <div className="flex items-center gap-1 bg-cream rounded-lg p-2">
              <i className="fa-solid fa-palette text-gray-600 mr-1" />
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-200 hover:scale-110 ${
                    color === c ? "border-gray-800 shadow-md scale-110" : "border-gray-300"
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Color: ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer hover:scale-110 transition-transform"
                title="Custom Color"
              />
            </div>

            {/* stroke size */}
            <div className="flex items-center gap-2 bg-cream rounded-lg px-3 py-2">
              <button
                onClick={() => setStrokeWidth((v) => Math.max(1, v - 1))}
                className="text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
                disabled={strokeWidth <= 1}
                title="Decrease Size"
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
                />
                <span className="text-sm font-medium w-8 text-center">
                  {strokeWidth}px
                </span>
              </div>

              <button
                onClick={() => setStrokeWidth((v) => Math.min(20, v + 1))}
                className="text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
                disabled={strokeWidth >= 20}
                title="Increase Size"
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
              >
                <i className="fa-solid fa-rotate-left" />
              </button>
              <button
                onClick={() => canvasBoardRef.current?.redo()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Redo (Ctrl+Y)"
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
            >
              <i className="fa-solid fa-trash" />
            </button>

            <div className="w-px h-6 bg-gray-300" />

            <div className="flex items-center gap-1 bg-cream rounded-lg p-1">
              <button
                onClick={() => canvasBoardRef.current?.save()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Save Board"
              >
                <i className="fa-solid fa-floppy-disk" />
              </button>
              <button
                onClick={handleLoad}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Load Board"
              >
                <i className="fa-solid fa-folder-open" />
              </button>
              <button
                onClick={() => canvasBoardRef.current?.exportPNG()}
                className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                title="Export as PNG"
              >
                <i className="fa-solid fa-file-export" />
              </button>
            </div>

            <div className="w-px h-6 bg-gray-300" />

            <button
              onClick={shareSessionId}
              className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
              title="Share Session ID"
            >
              <i className="fa-solid fa-share-nodes" />
            </button>

            <button
              onClick={() => setShowChat((v) => !v)}
              className={`p-2 rounded transition-colors relative ${
                showChat ? "bg-primary text-white" : "hover:bg-light-blue text-gray-700"
              }`}
              title="Toggle Chat"
            >
              <i className="fa-solid fa-comments" />
              {chatMessages.length > 0 && !showChat && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded transition-colors ${
                showSettings ? "bg-primary text-white" : "hover:bg-light-blue text-gray-700"
              }`}
              title="Settings"
            >
              <i className="fa-solid fa-gear" />
            </button>
          </div>
        </div>

        {/* status bar */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              {connected ? "Connected" : "Offline"}
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-users" />
              {userCount} {userCount === 1 ? "user" : "users"} online
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
                    : selectedTool === "text"
                    ? "fa-font"
                    : selectedTool === "fill"
                    ? "fa-fill-drip"
                    : selectedTool === "select-rect"
                    ? "fa-square-dashed"
                    : "fa-draw-polygon"
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

      {/* content */}
      <div className="flex-1 relative flex overflow-hidden h-full">
        {/* canvas */}
        <div className="flex-1 h-full w-full">
          <CanvasBoard
            ref={canvasBoardRef}
            selectedTool={selectedTool}
            color={color}
            strokeWidth={strokeWidth}
            whiteboardId={whiteboardId}
            socket={socketState}
            gridEnabled={gridEnabled}
            sessionToken={session?.access_token}
          />
        </div>

        {/* chat panel - overlays canvas */}
        {showChat && (
          <div className="absolute right-0 top-0 h-[90%] w-80 bg-white border-l shadow-lg flex flex-col z-40 overflow-hidden">
            <div className="p-3 border-b bg-cream flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-700">Chat</h3>
                {isTyping && (
                  <p className="text-xs text-gray-500">{isTyping} is typing...</p>
                )}
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fa-solid fa-times" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto bg-gray-50 min-h-0">
              {chatMessages.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-8">
                  <p>No messages yet</p>
                  <p className="text-xs mt-1">Start a conversation.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {chatMessages.map((msg, idx) => {
                    if (msg.type === "system") {
                      return (
                        <div key={idx} className="text-center text-xs text-gray-500 py-1">
                          {msg.text}
                        </div>
                      );
                    }

                    const self =
                      session?.user?.user_metadata?.display_name ||
                      session?.user?.email;
                    const isOwn = msg.user === self;

                    return (
                      <div
                        key={idx}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 ${
                            isOwn
                              ? "bg-primary text-white"
                              : "bg-white border border-gray-200"
                          }`}
                        >
                          <div
                            className={`text-xs font-semibold mb-1 ${
                              isOwn ? "text-blue-100" : "text-primary"
                            }`}
                          >
                            {msg.user}
                          </div>
                          <div className="text-sm break-words">{msg.text}</div>
                          <div
                            className={`text-xs mt-1 ${
                              isOwn ? "text-blue-100" : "text-gray-400"
                            }`}
                          >
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            <div className="p-3 border-t bg-white flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
                <button
                  onClick={sendChatMessage}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  disabled={!chatInput.trim() || !connected}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* settings panel */}
        {showSettings && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-start justify-end p-4 z-20">
            <div className="w-80 bg-white rounded-lg shadow-xl p-4 mt-16">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-700 text-lg">Settings</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <i className="fa-solid fa-times" />
                </button>
              </div>

              <div className="space-y-4">
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
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">
                    Session Info
                  </h4>
                  <div className="bg-gray-50 p-3 rounded-lg text-xs">
                    <div className="mb-2">
                      <span className="font-medium">Session ID:</span>
                      <div className="font-mono mt-1 break-all">{whiteboardId}</div>
                    </div>
                    <div>
                      <span className="font-medium">Active Users:</span>
                      <ul className="mt-1 space-y-1">
                        {activeUsers.length === 0 ? (
                          <li className="text-gray-500">No user list available</li>
                        ) : (
                          activeUsers.map((user, idx) => (
                            <li key={idx} className="flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              {user.userName}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">
                    Keyboard Shortcuts
                  </h4>
                  <div className="text-xs space-y-1 text-gray-500 max-h-40 overflow-y-auto">
                    <KbRow v="Pen" k="P" />
                    <KbRow v="Eraser" k="E" />
                    <KbRow v="Rectangle" k="R" />
                    <KbRow v="Circle" k="C" />
                    <KbRow v="Line" k="L" />
                    <KbRow v="Text" k="T" />
                    <KbRow v="Fill Bucket" k="F" />
                    <KbRow v="Rectangle Select" k="S" />
                    <KbRow v="Lasso Select" k="A" />
                    <KbRow v="Undo" k="Ctrl+Z" />
                    <KbRow v="Redo" k="Ctrl+Y" />
                    <KbRow v="Save" k="Ctrl+S" />
                    <KbRow v="Decrease Size" k="[" />
                    <KbRow v="Increase Size" k="]" />
                    <KbRow v="Close Chat/Settings" k="Esc" />
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">About</h4>
                  <p className="text-xs text-gray-500">
                    Real-time Collaborative Whiteboard v1.1
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

// tiny helper for the shortcuts list
function KbRow({ k, v }) {
  return (
    <div className="flex justify-between">
      <span>{v}</span>
      <kbd className="px-1 py-0.5 bg-gray-100 rounded">{k}</kbd>
    </div>
  );
}