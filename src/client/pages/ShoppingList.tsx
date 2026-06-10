import { useState, type FormEvent } from 'react';
import * as api from '../api.js';
import { useAppState } from '../context/AppContext.js';
import { useNickname } from '../hooks/useNickname.js';
import { Card } from '../components/ui/Card.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';

function formatTimestamp(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function formatBoughtDateLabel(value: string | null): string {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ShoppingList() {
  const { shoppingListItems } = useAppState();
  const { nickname } = useNickname();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openItems = shoppingListItems.filter((item) => !item.bought);
  const boughtItems = shoppingListItems.filter((item) => item.bought);
  const boughtItemsByDate = boughtItems.reduce<Array<{ label: string; items: typeof boughtItems }>>(
    (groups, item) => {
      const label = formatBoughtDateLabel(item.boughtAt);
      const existingGroup = groups.find((group) => group.label === label);
      if (existingGroup) {
        existingGroup.items.push(item);
        return groups;
      }

      groups.push({ label, items: [item] });
      return groups;
    },
    [],
  );

  const handleAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createShoppingListItem(name, nickname ?? undefined);
      setName('');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkBought = async (itemId: string) => {
    setSaving(true);
    setError('');
    try {
      await api.markShoppingListItemBought(itemId, nickname ?? undefined);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllBought = async () => {
    if (openItems.length === 0) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await Promise.all(
        openItems.map((item) => api.markShoppingListItemBought(item.id, nickname ?? undefined)),
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-4 lg:px-6">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold text-fg">Shopping List</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Add office supplies or snacks here. Anyone can mark an item as bought once they picked it up.
        </p>

        <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleAddItem}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Coffee beans, oat milk, printer paper..."
            className="flex-1"
          />
          <Button type="submit" disabled={saving}>
            Add item
          </Button>
        </form>

        {error ? <p className="mt-3 text-sm text-danger-fg">{error}</p> : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-warning bg-warning-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-warning-fg">To Buy ({openItems.length})</h2>
              <button
                type="button"
                onClick={() => {
                  void handleMarkAllBought();
                }}
                disabled={saving || openItems.length === 0}
                className="rounded bg-warning-solid px-3 py-1.5 text-xs font-medium text-warning-on transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Bought all
              </button>
            </div>
            {openItems.length === 0 ? (
              <p className="mt-3 text-sm italic text-warning-fg">Nothing pending right now.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {openItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning bg-surface px-3 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-fg">{item.name}</div>
                      <div className="text-xs text-fg-muted">
                        Added by {item.requestedBy} on {formatTimestamp(item.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleMarkBought(item.id);
                      }}
                      disabled={saving}
                      className="rounded bg-success-solid px-3 py-1.5 text-xs font-medium text-success-on transition-colors hover:opacity-90 disabled:opacity-60"
                    >
                      Mark bought
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-success bg-success-soft p-4">
            <h2 className="text-lg font-semibold text-success-fg">Bought ({boughtItems.length})</h2>
            {boughtItems.length === 0 ? (
              <p className="mt-3 text-sm italic text-success-fg">No completed purchases yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {boughtItemsByDate.map((group) => (
                  <div key={group.label}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-success-fg">
                      {group.label}
                    </h3>
                    <ul className="mt-2 space-y-3">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded border border-success bg-surface px-3 py-3"
                        >
                          <div className="text-sm font-medium text-fg">{item.name}</div>
                          <div className="mt-1 text-xs text-fg-muted">
                            Added by {item.requestedBy}. Bought by {item.boughtBy ?? 'someone'} on{' '}
                            {formatTimestamp(item.boughtAt)}.
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
