import { Link } from 'react-router-dom';

/**
 * NO_MENUS phase — empty state prompting the user to create a menu.
 */
export default function NoMenusView() {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">No menus yet</h2>
        <p className="mb-4 text-gray-600">Create a menu with at least one item to get started.</p>
        <Link
          to="/menus"
          className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Menu
        </Link>
      </div>
    </div>
  );
}
