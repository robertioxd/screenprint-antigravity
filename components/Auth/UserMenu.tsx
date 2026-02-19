import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { User, LogOut, ChevronDown } from 'lucide-react';

interface UserMenuProps {
    userEmail: string | undefined;
}

export const UserMenu: React.FC<UserMenuProps> = ({ userEmail }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setIsOpen(false);
    };

    if (!userEmail) return null;

    // Extract initial for avatar
    const initial = userEmail[0].toUpperCase();

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
            >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-1 ring-white/10 group-hover:ring-white/20">
                    {initial}
                </div>
                <span className="text-xs text-white/70 truncate max-w-[120px] hidden sm:block">
                    {userEmail}
                </span>
                <ChevronDown size={12} className={`text-white/30 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1d24] border border-white/10 rounded-lg shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                        <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Cuenta</p>
                        <p className="text-xs text-white/90 truncate mt-0.5" title={userEmail}>{userEmail}</p>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-2"
                    >
                        <LogOut size={14} />
                        Cerrar Sesión
                    </button>
                </div>
            )}
        </div>
    );
};
