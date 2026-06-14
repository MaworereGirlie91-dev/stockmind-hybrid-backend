import { cn } from '@/lib/utils';

interface BadgeProps {
  status: 'in_stock' | 'checked_out' | 'lost' | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  in_stock:     { label: 'In Stock',     color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  checked_out:  { label: 'Checked Out',  color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  lost:         { label: 'Lost',         color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  pending:      { label: 'Pending',      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

export default function StatusBadge({ status, className }: BadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    color: 'bg-[#fff0f2] text-[#9f1027] border-[#f3c6cc]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium tracking-wide uppercase',
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
