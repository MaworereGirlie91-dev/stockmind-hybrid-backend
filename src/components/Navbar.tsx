'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Scan,
  Settings,
  ShoppingCart,
  User,
  Users,
} from 'lucide-react';

import type { UserInfoPayload } from '@/lib/server/auth';

const adminNavItems = [
  { href: '/statistics', label: 'Dashboard', short: 'Dash', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', short: 'Stock', icon: Database },
  { href: '/scan', label: 'Scan/Add', short: 'Scan', icon: Scan },
  { href: '/sales', label: 'Sales', short: 'Sales', icon: ShoppingCart },
  { href: '/stock-count', label: 'Count', short: 'Count', icon: ClipboardList },
  { href: '/reports', label: 'Reports', short: 'Reports', icon: BarChart3 },
];

const salesNavItems = [
  { href: '/sales', label: 'Sales', short: 'Sales', icon: ShoppingCart },
];

const bottomNavAdmin = [
  { href: '/statistics', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scan', label: 'Scan', icon: Scan },
  { href: '/sales', label: 'Sales', icon: ShoppingCart },
  { href: '/stock-count', label: 'Count', icon: ClipboardList },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const bottomNavSales = [
  { href: '/sales', label: 'Sales', icon: ShoppingCart },
];

function readUserInfoCookie(): UserInfoPayload | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/sm_user=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(atob(match[1])) as UserInfoPayload;
  } catch {
    return null;
  }
}

function Avatar({ info, size = 32 }: { info: UserInfoPayload | null; size?: number }) {
  const initials = info?.displayName
    ? info.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : (info?.sub?.[0] ?? 'U').toUpperCase();

  if (info?.avatarUrl) {
    return (
      <Image
        src={info.avatarUrl}
        alt="Avatar"
        width={size}
        height={size}
        className="rounded-full object-cover border border-[#f3c6cc]"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-[#c8102e] text-white flex items-center justify-center font-semibold shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfoPayload | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserInfo(readUserInfoCookie());
  }, [pathname]);

  useEffect(() => {
    const refresh = () => setUserInfo(readUserInfoCookie());
    window.addEventListener('stockmind:user-updated', refresh);
    return () => window.removeEventListener('stockmind:user-updated', refresh);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = useCallback(async () => {
    setDropdownOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }, [router]);

  const role = userInfo?.role ?? 'admin';
  const navItems = role === 'sales' ? salesNavItems : adminNavItems;
  const bottomItems = role === 'sales' ? bottomNavSales : bottomNavAdmin;
  const isActive = (href: string) =>
    pathname === href || (href !== '/statistics' && pathname.startsWith(href));

  const displayName = userInfo?.displayName ?? userInfo?.sub ?? 'User';
  const roleLabel = role === 'admin' ? 'Administrator' : 'Sales Staff';

  return (
    <>
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b border-[#f3c6cc] bg-white/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-2">
            {/* Logo */}
            <Link
              href={role === 'sales' ? '/sales' : '/statistics'}
              className="flex items-center gap-2 shrink-0"
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

            {/* Desktop nav pills */}
            <nav className="hidden lg:flex items-center gap-0.5 rounded-xl p-0.5 border border-[#f3c6cc] bg-[#fffafa]">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    isActive(href)
                      ? 'bg-[#c8102e] text-white shadow-sm'
                      : 'text-[#6b7280] hover:text-[#9f1027] hover:bg-[#fff0f2]'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </Link>
              ))}
            </nav>

            {/* Tablet scrollable nav */}
            <nav className="hidden sm:flex lg:hidden items-center gap-0.5 rounded-xl p-0.5 border border-[#f3c6cc] bg-[#fffafa] overflow-x-auto max-w-[360px] scrollbar-hide">
              {navItems.map(({ href, short, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap shrink-0 ${
                    isActive(href)
                      ? 'bg-[#c8102e] text-white'
                      : 'text-[#6b7280] hover:text-[#9f1027] hover:bg-[#fff0f2]'
                  }`}
                >
                  <Icon size={11} />
                  {short}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[#6b7280] rounded-full border border-[#f3c6cc] bg-[#fffafa] px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c8102e] scan-pulse" />
                Live
              </div>

              {/* User avatar + dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-full border border-[#f3c6cc] bg-[#fffafa] pl-1 pr-2 py-1 hover:border-[#c8102e] hover:bg-[#fff0f2] transition-colors"
                >
                  <Avatar info={userInfo} size={26} />
                  <ChevronDown
                    size={11}
                    className={`text-[#6b7280] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#f3c6cc] rounded-2xl shadow-xl overflow-hidden z-50">
                    {/* User header */}
                    <div className="px-4 py-3 border-b border-[#f3c6cc] bg-[#fffafa] flex items-center gap-3">
                      <Avatar info={userInfo} size={36} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#1f2937] truncate">{displayName}</div>
                        <div className="text-[11px] text-[#9f1027] font-medium">{roleLabel}</div>
                      </div>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-[#fff0f2] hover:text-[#9f1027] transition-colors"
                      >
                        <User size={14} className="text-[#c8102e]" />
                        My Profile
                      </Link>
                      {role === 'admin' && (
                        <>
                          <Link
                            href="/users"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-[#fff0f2] hover:text-[#9f1027] transition-colors"
                          >
                            <Users size={14} className="text-[#c8102e]" />
                            Manage Users
                          </Link>
                          <Link
                            href="/settings"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-[#fff0f2] hover:text-[#9f1027] transition-colors"
                          >
                            <Settings size={14} className="text-[#c8102e]" />
                            Settings
                          </Link>
                        </>
                      )}
                    </div>

                    <div className="border-t border-[#f3c6cc] py-1">
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#6b7280] hover:bg-red-50 hover:text-red-600 transition-colors w-full text-left"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-[#f3c6cc]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-16">
          {bottomItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-[#c8102e]' : 'text-[#9ca3af]'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {label}
              </Link>
            );
          })}
          {/* Me / Profile tab */}
          <Link
            href="/profile"
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              pathname === '/profile' ? 'text-[#c8102e]' : 'text-[#9ca3af]'
            }`}
          >
            <div className={pathname === '/profile' ? 'ring-2 ring-[#c8102e] rounded-full' : ''}>
              <Avatar info={userInfo} size={22} />
            </div>
            <span>Me</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
