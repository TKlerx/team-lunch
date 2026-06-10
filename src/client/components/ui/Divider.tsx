import { cn } from '../../lib/cn.js';

/** Themed horizontal rule. */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-t border-border', className)} />;
}
