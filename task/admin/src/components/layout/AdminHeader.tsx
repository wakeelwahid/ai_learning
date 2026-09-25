import { useAppSelector, useAppDispatch } from "@/store";
import { logout } from "@/store/auth";
import { LogOut, Menu, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AdminHeaderProps {
  onMenuClick: () => void;
}

export default function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 shrink-0 min-w-0">
      {/* Left: hamburger (mobile only) */}
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
        aria-label="Open sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Spacer so right section aligns properly on desktop where hamburger is hidden */}
      <div className="hidden lg:block" />

      {/* Right: user info + logout */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-gray-100 min-w-0 max-w-[160px] sm:max-w-xs">
          <User className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
            {user?.email}
          </span>
          {user?.role && (
            <span className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-primary-100 text-primary-700 shrink-0">
              {user.role}
            </span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-gray-500 hover:text-red-600 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
