import { useState } from "react";

export default function Whiteboard() {
    const [selectedTool, setSelectedTool] = useState("pen");
    const [color, setColor] = useState("#000000");
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [showChat, setShowChat] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const colors = ["#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#6D94C5"];

    // A few placeholders:
    const handleClearBoard = () => {
        console.log("Clear board");
    };
    const handleUndo = () => {
        console.log("Undo action");
    };
    const handleRedo = () => {
        console.log("Redo action");
    };
    const handleSave = () => {
        console.log("Save board");
    };

    const handleLoad = () => {
        console.log("Load board");
    };
    const handleExport = () => {
        console.log("Export board");
    };

    return (
        <div className="h-[calc(100vh-7.5rem)] flex flex-col bg-gray-50">
            <div className="bg-white border-b shadow-sm p-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-primary-light rounded-lg p-1">
                            <button
                                onClick={() => setSelectedTool('pen')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'pen' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Pen"
                            >
                                <i className="fa-whiteboard fa-semibold fa-pencil"></i>
                            </button>
                            <button
                                onClick={() => setSelectedTool('eraser')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'eraser' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Eraser"
                            >
                                <i className="fa-whiteboard fa-semibold fa-eraser"></i>
                            </button>
                            <button
                                onClick={() => setSelectedTool('rectangle')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'rectangle' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Rectangle"
                            >
                                <i className="fa-whiteboard fa-semibold fa-square"></i>
                            </button>
                            <button
                                onClick={() => setSelectedTool('circle')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'circle' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Circle"
                            >
                                <i className="fa-whiteboard fa-semibold fa-circle"></i>
                            </button>
                            <button
                                onClick={() => setSelectedTool('line')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'line' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Line"
                            >
                                <i className="fa-whiteboard fa-solid fa-slash"></i>
                            </button>
                            <button
                                onClick={() => setSelectedTool('text')}
                                className={`p-2 rounded transition-colors ${
                                    selectedTool === 'text' 
                                    ? 'bg-primary text-white' 
                                    : 'hover:bg-light-blue text-gray-700'
                                }`}
                                title="Text"
                            >
                                <i className="fa-whiteboard fa-solid fa-font"></i>
                            </button>
                        </div>

                        <div className="flex items-center gap-1 bg-primary-light rounded-lg p-3">
                            <i className="fa-whiteboard fa-solid fa-palette text-gray-600 mr-1"></i>
                            {colors.map(c => (
                                <button
                                key={c}
                                onClick={()=> setColor(c)}
                                className={`w-6 h-6 rounded border-2 ${
                                    color === c ? 'border-gray-600' : 'border-gray-300'
                                }`}
                                style={{ backgroundColor: c }}
                                title={`Color ${c}`}
                                />
                            ))}
                            <input 
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center gap-2 bg-primary-light rounded-lg p-3">
                            <button 
                            onClick={()=> setStrokeWidth(Math.max(1, strokeWidth - 1))}
                            className="text-gray-600 hover:text-primary transition-colors"
                            title="Decrease Stroke Width"
                            >
                                <i className="fa-whiteboard fa-solid fa-minus"></i>
                            </button>
                            <span className="text-sm font-medium w-8 text-center">{strokeWidth}px</span>
                            <button 
                            onClick={()=> setStrokeWidth(Math.min(20, strokeWidth + 1))}
                            className="text-gray-600 hover:text-primary transition-colors"
                            title="Increase Stroke Width"
                            >
                                <i className="fa-whiteboard fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                        onClick={handleUndo}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Undo"
                        >
                            <i className="fa-whiteboard fa-solid fa-rotate-left"></i>
                        </button>
                        <button
                        onClick={handleRedo}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Redo"
                        >
                            <i className="fa-whiteboard fa-solid fa-rotate-right"></i>
                        </button>  

                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        <button
                        onClick={handleClearBoard}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Clear Board" 
                        >
                            <i className="fa-whiteboard fa-solid fa-trash"></i>
                        </button>

                        <button 
                        onClick={handleSave}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Save"
                        >
                            <i className="fa-whiteboard fa-solid fa-floppy-disk"></i>
                        </button>
                        <button 
                        onClick={handleLoad}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Load"
                        >
                            <i className="fa-whiteboard fa-solid fa-folder-open"></i>
                        </button>
                        <button 
                        onClick={handleExport}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Export"
                        >
                            <i className="fa-whiteboard fa-solid fa-file-export"></i>
                        </button>

                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        <button
                        onClick={() => setShowChat(!showChat)}
                        className={`p-2 rounded transition-colors ${
                            showChat
                            ? 'bg-primary text-white'
                            : 'hover:bg-light-blue text-gray-700'
                        }`}
                        title="Toggle Chat"
                        >
                            <i className="fa-whiteboard fa-solid fa-comments"></i>
                        </button>
                        <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded hover:bg-light-blue text-gray-700 transition-colors"
                        title="Settings"
                        >
                            <i className="fa-whiteboard fa-solid fa-gear"></i>
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <i className="fa-whiteboard fa-sollid fa-users"></i> 
                            5 users online
                            </span>
                        <span className="flex items-center gap-1">
                            <i className="fa-whiteboard fa-solid fa-rectangle-tall"></i> 
                            Board: Untitled-1
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span>Tool: {selectedTool}</span>
                        <span>Auto Saved Enabled</span>
                    </div>
                </div>
            </div>
        </div>
    )

}