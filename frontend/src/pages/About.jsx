
export default function About() {
    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">About Whiteboard</h1>
                <p className="text-lg text-gray-600">
                    A real-time collaborative whiteboard application.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-white rounded-lg shadow-sm p-6 border">
                    <h2 className="text-xl font-semibold text-gray-900 mb-3">Features</h2>
                    <ul className="space-y-2 text-gray-600">
                        <li><i className="fa-whiteboard fa-semibold fa-check"></i>Real-Time collaborative drawing</li>
                        <li><i className="fa-whiteboard fa-semibold fa-check"></i>Various drawing tools and colors</li>
                        <li><i className="fa-whiteboard fa-semibold fa-check"></i>Chat integration</li>
                        <li><i className="fa-whiteboard fa-semibold fa-check"></i>User Authentication</li>
                        <li> ... </li>
                    </ul>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6 border">
                    <h2 className="text-xl font-semibold text-gray-900 mb-3">Technology Stack</h2>
                    <div className="space-y-3 text-gray-600">
                        <div>
                            <h3 className="font-medium text-gray-900">Frontend:</h3>
                            <p>React, HTML5 Canvas, Tailwind CSS</p>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900">Backend:</h3>
                            <p>Node.Js, Socket.io, MongoDB Atlas</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}