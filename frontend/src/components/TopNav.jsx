import {Link} from 'react-router-dom';

export default function TopNav({onToggleSidebar}) {
    return (
        <header className="sticky top-0 z-30 w-full border-b bg-white/90 backdrop-blur shadow-sm">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
                <button
                    onClick={onToggleSidebar}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors md:hidden"
                    aria-label="Toggle Menu"
                >
                    <i className="fa-whiteboard fa-semibold fa-bars text-[16px]" aria-hidden="true" ></i>
                </button>

                <button
                    onClick={onToggleSidebar}
                    className="hidden md:flex items-center gap-2 
                        rounded-lg px-3 py-2 
                        text-sm font-medium text-gray-700 
                        hover:bg-gray-100 
                        transition-colors"
                    aria-label="Toggle Sidebar"
                >
                    <i className="fa-solid fa-bars text-[16px]" aria-hidden="true"></i>
                    <span className="hidden md:inline"></span>
                </button>

                <Link to="/" className="flex items-center gap-2 font-semibold text-xl">
                    <span className="tracking-tight">WHITEBOARD</span>
                </Link>

                <nav className="hidden md:flex items-center gap-4 text-sm">
                    <Link className="nav-link" to="/about">About</Link>
                    <Link className="nav-link" to="/contact">Contact</Link>
                    <Link className="nav-link" to="/login">Login</Link>
                </nav>
            </div>
        </header>
    );
}

