import {Link} from 'react-router-dom';

export default function Home() {
    return(
        <div className="min-h-screen bg-primary-light">
            <header className="py-6 px-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xl">
                        <span className="text-gray-800">WHITEBOARD</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-6">
                        <Link className="text-gray-700 hover:text-gray-900 transition-colors" to="/about">
                        About
                        </Link>
                        <Link className="text-gray-700 hover:text-gray-900 transition-colors" to="/contact">
                        Contact
                        </Link>
                        <Link className="text-gray-700 hover:text-gray-900 transition-colors" to="/login">
                        Login
                        </Link>                         
                    </nav>
                </div>
            </header>
            <main>
                <section className="py-20 px-4">
                    <div className="max-w-6xl mx-auto text-center">
                        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                            Collaborate in
                            <span className="block text-primary-blue">
                                Real-Time
                            </span>
                        </h1>
                        <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
                            Insert intro into the collaborating whiteboard text here....
                            draw and collaborate with your team and friends.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                            to="/register"
                            className="px-8 py-4 rounded-lg text-white font-semibold text-lg transition-transform hover:scale-105 shadow-lg bg-primary-blue">
                            Get Started Here
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="py-16 px-4">
                    <div className="max-w-6xl mx-auto">
                        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">
                            Let's create together
                        </h2>
                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="text-center p-6 rounded-2xl shadow-sm bg-priary-medium">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-primary-light-blue">
                                    <i className="fa-whiteboard fa-semibold fa-paintbrush text-2xl text-primary-blue"></i>
                                </div>
                        
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">Draw & Create</h3>
                                <p className="text-gray-600">
                                    Multiple drawing tools, colors, and brush sizes.
                                </p>
                            </div>
                            <div className="text-center p-6 rounded-2xl shadow-sm bg-priary-medium">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-primary-light-blue">
                                    <i className="fa-whiteboard fa-semibold fa-users text-2xl text-primary-blue"></i>
                                </div>
                        
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">Real-Time Sync</h3>
                                <p className="text-gray-600">
                                    see changes instantly as you collaborate. 
                                </p>
                            </div>     

                            <div className="text-center p-6 rounded-2xl shadow-sm bg-priary-medium">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-primary-light-blue">
                                    <i className="fa-whiteboard fa-semibold fa-question text-2xl text-primary-blue"></i>
                                </div>
                        
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">3rd Feature</h3>
                                <p className="text-gray-600">
                                    Some other feature, export maybe. 
                                </p>
                            </div>   
                        </div>
                    </div>
                </section>

                <section className="py-16 px-4">
                    <div className="max-w-4xl mx-auto">
                        <div className="rounded-3xl shadow-2xl overflow-hidden bg-primary-light-blue">
                            <div className="p-8 md:p-12">
                                <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">
                                    Your Canvas Awaits
                                </h3>
                                <div className="aspect-video rounded-xl border-4 border-white bg-white shadow-inner flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F5EFE6' }}>
                                            <i className="fa-whiteboard fa-semibold fa-chalkboard text-3xl text-primary-blue "></i>
                                        </div>
                                        <p className="text-gray-500 text-lg">Interactive whiteboard</p>
                                        <p className="text-gray-400 text-sm mt-2">Click "Start Drawing" to start drawing  
                                        </p>

                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>                
                <section className="py-20 px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                            Ready to start collaborating?
                        </h2>
                        <p className="text-xl text-gray-600 mb-8">
                            Join in!
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/register"
                                className="px-8 py-4 rounded-lg text-white font-semibold text-lg transition-transform hover:scale-105 shadow-lg bg-primary-blue"
                            >
                                Register
                            </Link>

                            <Link
                                to="/login"
                                className="px-8 py-4 rounded-lg text-white font-semibold text-lg transition-transform hover:scale-105 shadow-lg bg-primary-blue"
                            >
                                Login
                            </Link>                            
                        </div>
                    </div>
                </section>
            </main>

            <footer className="py-12 px-4 border-t border-prumary-medium">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="flex items-center gap-2 font-bold text-lg mb-4 mb:mb-0">
                            <span className="text-gray-800">WHITEBOARD</span>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <Link className="text-gray-600 hover:text-gray-900 transition-colors" to="/about">
                                About
                            </Link>
                            <Link className="text-gray-600 hover:text-gray-900 transition-colors" to="/contact">
                                Contact
                            </Link>
                            <p className="text-gray-500 text-sm">
                                CPSC449 - FALL 2025
                            </p>
                        </div>                        
                    </div>
                </div>
            </footer>

        </div>
    );
}