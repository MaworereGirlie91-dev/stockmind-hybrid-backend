'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Scan,
  ShoppingCart,
  X,
  Menu,
} from 'lucide-react';

import WebSessionInactivityGuard from '@/components/WebSessionInactivityGuard';

const navItems = [
  { href: '/statistics', label: 'Dashboard', short: 'Dash', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', short: 'Stock', icon: Database },
  { href: '/scan', label: 'Scan/Add', short: 'Scan', icon: Scan },
  { href: '/sales', label: 'Sales', short: 'Sales', icon: ShoppingCart },
  { href: '/stock-count', label: 'Count', short: 'Count', icon: ClipboardList },
  { href: '/reports', label: 'Reports', short: 'Reports', icon: BarChart3 },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#f3c6cc] bg-white/95 backdrop-blur-xl">
      <WebSessionInactivityGuard />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="h-14 flex items-center justify-between gap-2">

          {/* Logo — shrink-0 so it never gets squeezed */}
          <Link
            href="/statistics"
            className="flex items-center gap-2 shrink-0"
            onClick={() => setMobileOpen(false)}
          >
            <div className="w-7 h-7 relative rounded-md overflow-hidden border border-[#f3c6cc] bg-white shrink-0">
              <Image src="/aiec-logo.png" alt="AIEC" fill className="object-contain" />
            </div>
            <div className="hidden xs:block">
              <div className="text-[#1f2937] text-sm font-bold leading-none">StockMind</div>
              <div className="text-[9px] text-[#6b7280] font-medium uppercase tracking-widest leading-none mt-0.5">
                RFID Inventory
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5 rounded-xl p-0.5 border border-[#f3c6cc] bg-[#fffafa] overflow-x-auto">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/statistics' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#c8102e] text-white shadow-sm'
                      : 'text-[#6b7280] hover:text-[#9f1027] hover:bg-[#fff0f2]'
                  }`}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Tablet scrollable nav */}
          <nav className="hidden sm:flex lg:hidden items-center gap-0.5 rounded-xl p-0.5 border border-[#f3c6cc] bg-[#fffafa] overflow-x-auto max-w-[360px] scrollbar-hide">
            {navItems.map(({ href, short, icon: Icon }) => {
              const active = pathname === href || (href !== '/statistics' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#c8102e] text-white'
                      : 'text-[#6b7280] hover:text-[#9f1027] hover:bg-[#fff0f2]'
                  }`}
                >
                  <Icon size={11} />
                  <span>{short}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[#6b7280] rounded-full border border-[#f3c6cc] bg-[#fffafa] px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8102e] scan-pulse" />
              Live
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-[#6b7280] border border-[#f3c6cc] hover:text-[#9f1027] hover:border-[#c8102e] hover:bg-[#fff0f2] transition-colors"
              title="Sign out"
            >
              <LogOut size={11} />
              <span className="hidden lg:inline">Sign out</span>
            </button>
            <button
              type="button"
              className="sm:hidden p-1.5 rounded-lg text-[#6b7280] border border-[#f3c6cc] hover:text-[#9f1027] hover:bg-[#fff0f2] transition-colors"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-[#f3c6cc] bg-white/98 backdrop-blur-xl">
          <nav className="px-3 py-3 grid grid-cols-3 gap-1.5">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/statistics' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] font-medium transition-colors ${
                    active
                      ? 'bg-[#c8102e] text-white'
                      : 'text-[#6b7280] hover:text-[#9f1027] hover:bg-[#fff0f2] border border-[#f3c6cc]'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => { setMobileOpen(false); void handleLogout(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs text-[#6b7280] border border-[#f3c6cc] hover:text-[#9f1027] hover:border-[#c8102e] hover:bg-[#fff0f2] transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
