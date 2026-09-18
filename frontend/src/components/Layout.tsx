import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
    <div className="font-brand text-[26px] font-bold leading-none tracking-[0.22em] text-white">DELORA</div>
    <div className="font-script mt-1.5 text-xl leading-none text-[#E8D9B8]">Bloom &amp; Gift</div>
  </div>
);

const Layout: React.FC = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#1F2823] shadow-[4px_0_24px_-8px_rgba(31,40,35,0.45)] md:flex">
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
                `flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-[#8CAA9A] text-white shadow-md' : 'text-[#AFC0B4] hover:bg-[#2B3730] hover:text-white'
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
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#1F2823]/95 px-4 py-3 shadow-md backdrop-blur-md md:hidden">
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
        <div className="fixed inset-0 z-50 bg-white/25 backdrop-blur-md md:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            className="animate-modal absolute inset-y-0 left-0 flex w-72 flex-col bg-[#1F2823] shadow-2xl"
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
                    `flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      isActive ? 'bg-[#8CAA9A] text-white shadow-md' : 'text-[#AFC0B4] hover:bg-[#2B3730] hover:text-white'
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
      <main className="px-4 pb-28 pt-5 sm:px-6 md:ml-64 md:px-8 md:pb-12 md:pt-8">
        <div key={location.pathname} className="animate-fade-up mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav
        className="fixed bottom-3 left-3 right-3 z-30 grid h-16 grid-cols-5 items-center gap-1 rounded-full border border-[#E6E2D8] bg-white/90 px-2 shadow-[0_8px_32px_0_rgba(46,59,52,0.12)] backdrop-blur-xl md:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
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
              `flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-medium transition-all duration-200 ${
                isActive ? 'bg-[#8CAA9A]/15 text-[#5F7F70]' : 'text-[#85978C]'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-[#85978C] transition-all duration-200"
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
