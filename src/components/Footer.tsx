import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="border-t border-[#f3c6cc] mt-16 py-8 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rk-surface rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 relative rounded-lg overflow-hidden border border-[#f3c6cc] shrink-0 bg-white">
              <Image src="/aiec-logo.png" alt="AIEC" fill className="object-contain" />
            </div>
            <div className="text-xs text-[#6b7280] min-w-0">
              <span className="text-[#9f1027] font-semibold tracking-wide uppercase">
                StockMind
              </span>
              <span>{' - '}</span>
              <span>AIEC operations platform</span>
            </div>
          </div>
          <div className="text-xs text-[#6b7280] tracking-wide">
            Smart inventory. Zero guesswork. - {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </footer>
  );
}
