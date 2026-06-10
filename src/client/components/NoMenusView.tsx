import { Link } from 'react-router-dom';

/**
 * NO_MENUS phase — empty state prompting the user to create a menu.
 */
export default function NoMenusView() {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-fg">No menus yet</h2>
        <p className="mb-4 text-fg-muted">Create a menu with at least one item to get started.</p>
        <Link
          to="/menus"
          className="inline-block rounded bg-accent-solid px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:opacity-90"
        >
          Create Menu
        </Link>
      </div>
    </div>
  );
}
