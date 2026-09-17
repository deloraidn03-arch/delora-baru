import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  ShoppingBag,
  ClipboardList,
  Users,
  Landmark,
  Banknote,
  Menu,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
  { to: '/penjualan', label: 'Penjualan', icon: ShoppingCart },
  { to: '/pembelian', label: 'Pembelian', icon: ShoppingBag },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/biaya', label: 'Biaya', icon: Receipt },
  { to: '/customer', label: 'Customer', icon: Users },
  { to: '/aset', label: 'Aset Tetap', icon: Landmark },
  { to: '/kas', label: 'Kas & Bank', icon: Banknote },
];

const Brand: React.FC = () => (
  <div className="select-none">
    <div className="font-brand text-2xl font-bold tracking-[0.18em] text-white">DELORA</div>
    <div className="font-brand text-sm italic text-[#e8d9b8]">— Bloom &amp; Gift —</div>
  </div>
);

const Layout: React.FC = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#f6f8f6]">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#1f2b24] md:flex">
        <div className="border-b border-white/10 px-5 py-6">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-[#8caa9a] text-white' : 'text-[#b9c8bf] hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate px-2 text-xs text-[#8ba295]">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#b9c8bf] transition-colors hover:bg-white/5 hover:text-white"
            data-testid="logout-button"
          >
            <LogOut size={18} /> Keluar
          </button>
        </div>
      </aside>

      {/* Top bar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#1f2b24] px-4 py-3 md:hidden">
        <Brand />
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
          data-testid="mobile-menu-button"
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Drawer mobile (semua menu) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-[#2e3b34]/60 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#1f2b24]"
            onClick={(e) => e.stopPropagation()}
            data-testid="mobile-drawer"
          >
            <div className="border-b border-white/10 px-5 py-6">
              <Brand />
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setDrawerOpen(false)}
                  data-testid={`drawer-nav-${item.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-[#8caa9a] text-white' : 'text-[#b9c8bf] hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 p-3">
              <button
                onClick={handleSignOut}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#b9c8bf] hover:text-white"
                data-testid="drawer-logout-button"
              >
                <LogOut size={18} /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Konten */}
      <main className="px-4 pb-24 pt-4 sm:px-6 md:ml-64 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[#dfe7e1] bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {[
          { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
          { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
          { to: '/penjualan', label: 'Penjualan', icon: ShoppingCart },
          { to: '/pembelian', label: 'Pembelian', icon: ShoppingBag },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`bottomnav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#6f8f7f]' : 'text-[#93a298]'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium text-[#93a298]"
          data-testid="bottomnav-lainnya"
        >
          <Menu size={20} />
          Lainnya
        </button>
      </nav>
    </div>
  );
};

export default Layout;
