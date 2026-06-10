import type {
  ComponentPropsWithoutRef,
  ElementType,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Themed popover container for dropdown menus (`role="menu"`). Positioned
 * absolutely relative to the nearest positioned ancestor.
 */
export function MenuList({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="menu"
      className={cn(
        'absolute right-0 z-50 mt-2 overflow-hidden rounded-lg border border-border',
        'bg-surface-raised py-1 text-fg shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type MenuItemProps<C extends ElementType> = {
  /** Element/component to render as — e.g. `Link` for navigation items. */
  as?: C;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<C>, 'as' | 'className' | 'children'>;

/**
 * Themed menu row. Renders a `<button>` by default; pass `as={Link}` (or any
 * element/component) for navigation items so theming stays in one place.
 */
export function MenuItem<C extends ElementType = 'button'>({
  as,
  className,
  children,
  ...props
}: MenuItemProps<C>) {
  const Component = (as ?? 'button') as ElementType;
  return (
    <Component
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-fg transition-colors',
        'hover:bg-surface-muted',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
