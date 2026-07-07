import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './ui/Button.js';

interface TimerActionHeaderProps {
  title: ReactNode;
  timerLabel: string;
  remainingSeconds: number;
  totalSeconds: number;
  triggerAriaLabel: string;
  menuWidthClass?: string;
  dueStyle?: boolean;
  children: (controls: { closeMenu: () => void }) => ReactNode;
}

export default function TimerActionHeader({
  title,
  timerLabel,
  remainingSeconds,
  totalSeconds,
  triggerAriaLabel,
  menuWidthClass = 'w-52',
  dueStyle = false,
  children,
}: TimerActionHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isTimeUp = dueStyle || remainingSeconds <= 0;

  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const normalizedTotal = Math.max(1, totalSeconds);
  const normalizedRemaining = Math.max(0, Math.min(remainingSeconds, normalizedTotal));
  const fraction = normalizedRemaining / normalizedTotal;
  const offset = circumference * (1 - fraction);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isMenuOpen]);

  return (
    <div
      className={`relative mb-4 flex items-center justify-between rounded px-4 py-2 ${
        dueStyle ? 'delivery-due-alert' : 'bg-accent-soft'
      }`}
      ref={containerRef}
    >
      <span className={`text-sm font-medium ${dueStyle ? 'text-danger-fg' : 'text-accent-fg'}`}>
        {title}
      </span>
      <Button
        variant="ghost"
        onClick={() => setIsMenuOpen((open) => !open)}
        className={`inline-flex items-center gap-1 px-2 py-1 font-bold hover:bg-surface/60 ${
          dueStyle ? 'text-danger-fg' : 'text-accent-fg'
        }`}
        aria-label={triggerAriaLabel}
      >
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <svg width="20" height="20" className="-rotate-90">
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-20"
            />
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
        </span>
        {isTimeUp && (
          <span className="ringing-clock" role="img" aria-label="Ringing clock">
            ⏰
          </span>
        )}
        <span>{timerLabel}</span>
      </Button>

      {isMenuOpen && (
        <div className={`absolute right-4 top-[calc(100%+0.5rem)] z-20 rounded border border-border bg-surface-raised shadow-lg ${menuWidthClass}`}>
          {children({ closeMenu: () => setIsMenuOpen(false) })}
        </div>
      )}
    </div>
  );
}