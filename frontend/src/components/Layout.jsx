import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';
import SideNav from './SideNav';

export default function Layout() {
  // note: mobile uses sidebarOpen (off-canvas), desktop uses desktopSidebarOpen (collapse)
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  const location = useLocation();

  const isMobile = () => window.innerWidth < 768;

  const closeSidebar = () => setSidebarOpen(false);

  const handleToggleSidebar = () => {
    // note: mobile toggles overlay menu, desktop collapses the static rail
    if (isMobile()) {
      setSidebarOpen((v) => !v);
    } else {
      setDesktopSidebarOpen((v) => !v);
    }
  };

  // close mobile sidebar on route change (so it doesn't stay open after navigation)
  useEffect(() => {
    if (sidebarOpen) closeSidebar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // keep state sane when resizing across the md breakpoint
  useEffect(() => {
    const onResize = () => {
      if (isMobile()) {
        // on mobile we don't show the desktop rail, keep it collapsed state but irrelevant
        // leave sidebarOpen as-is (user choice)
      } else {
        // on desktop the off-canvas should be hidden
        setSidebarOpen(false);
        // if someone shrank then expanded, default the rail to open for usability
        setDesktopSidebarOpen((prev) => prev ?? true);
      }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // lock body scroll when mobile sidebar overlay is open
  useEffect(() => {
    if (sidebarOpen && isMobile()) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen surface">
      <TopNav onToggleSidebar={handleToggleSidebar} />

      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* sidebar container */}
        <div
          className={[
            // positioning: off-canvas on mobile, sticky on desktop
            'fixed md:sticky left-0 top-14 md:top-0',
            'z-50 md:z-auto',
            'h-[calc(100vh-3.5rem)] md:h-full',
            // width behavior
            'bg-white shadow-xl md:shadow-none transition-all duration-300 ease-in-out',
            // mobile slide in/out
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'md:translate-x-0',
            // desktop collapse (width to 0 hides rail but keeps layout)
            desktopSidebarOpen ? 'md:w-64' : 'md:w-0 md:overflow-hidden',
            // base width for mobile panel
            'w-64',
          ].join(' ')}
          role={isMobile() ? 'dialog' : undefined}
          aria-modal={isMobile() ? 'true' : undefined}
        >
          <SideNav onNavigate={closeSidebar} />
        </div>

        {/* main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
