import {useState} from 'react';
import {Outlet} from 'react-router-dom'
import TopNav from './TopNav';
import SideNav from './SideNav';

export default function Layout(){
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const closeSidebar = () => setSidebarOpen(false);

    const handleToggleSidebar = () => {
        // mobile or desktop
        if (window.innerWidth < 768) {
            // Mobile: toggle mobile sidebar
            setSidebarOpen(prev => !prev);
        } else {
            // Desktop: toggle desktop sidebar
            setDesktopSidebarOpen(prev => !prev);
        }
    };

    return(
        <div className="min-h-screen surface">
            <TopNav onToggleSidebar={handleToggleSidebar} />
            
            <div className="flex h-[calc(100vh-3.5rem)]">

                {/* mobile */}
                {sidebarOpen && (
                    <div 
                        className="fixed inset-0 z-40 bg-black/30 md:hidden" 
                        onClick={closeSidebar} 
                    />
                )}

                <div className={`
                    fixed md:sticky
                    left-0 top-14 md:top-0
                    z-50 md:z-auto
                    h-[calc(100vh-3.5rem)] md:h-full
                    w-64 
                    transform bg-white shadow-xl md:shadow-none
                    transition-all duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0
                    ${desktopSidebarOpen ? 'md:w-64' : 'md:w-0 md:overflow-hidden'}
                `}>
                    <SideNav onNavigate={closeSidebar} />
                </div>
                <main className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-7xl p-4 md:p-6">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}