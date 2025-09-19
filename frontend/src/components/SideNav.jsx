import { NavLink} from 'react-router-dom';

const linkBase = "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors";

export default function SideNav({onNavigate}){
    return(
        <aside className="h-full w-64 shrink-0 border-r bg-white p-3 overflow-y-auto">
            <div className="mb-4 rounded-2xl bg-beige p-4">
                <p className="text-xs text-gray-600 font-medium">Navigation</p>
            </div>

            <div className="space-y-1">
                <NavLink 
                    to="/" end
                    className={({isActive}) => `${linkBase} ${
                        isActive 
                        ? 'nav-active' 
                        : 'nav-link text-gray-700 hover:bg-beige'
                    }`}
                    onClick={onNavigate}
                    >
                    <i className="fa-solid fa-house text-[16px]" aria-hidden="true"></i>
                    Home 
                </NavLink>

                <NavLink 
                    to="/whiteboard" end
                    className={({isActive}) => `${linkBase} ${
                        isActive 
                        ? 'nav-active' 
                        : 'nav-link text-gray-700 hover:bg-beige'
                    }`}
                    onClick={onNavigate}
                    >
                    <i className="fa-whiteboard fa-semibold fa-chalkboard text-[16px]" aria-hidden="true"></i>
                    Whiteboard 
                </NavLink>


            </div>
        </aside>
    );
}