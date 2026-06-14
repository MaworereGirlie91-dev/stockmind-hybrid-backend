'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { AlertCircle, Edit3, MapPin, RefreshCw, Save, Settings, Tag, Trash2, X } from 'lucide-react';

import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { useReferenceData } from '@/hooks/useReferenceData';
import { locationTypeLabel } from '@/lib/location';
import { CategoryRecord, LocationRecord } from '@/types';

type EditableRecord = CategoryRecord | LocationRecord;

function SectionCard({
  title,
  icon,
  description,
  items,
  creatingLabel,
  onCreate,
  onRename,
  onDeleteSoft,
  onDeleteHard,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  items: EditableRecord[];
  creatingLabel: string;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDeleteSoft: (id: string) => Promise<unknown>;
  onDeleteHard: (id: string) => Promise<unknown>;
  loading: boolean;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canCreate = newName.trim().length > 0;

  const startEdit = (item: EditableRecord) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setActionError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    setCreating(true);
    setActionError('');
    try {
      await onCreate(trimmed);
      setNewName('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to create item.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setActionError('Name cannot be empty.');
      return;
    }
    setBusyId(id);
    setActionError('');
    try {
      await onRename(id, trimmed);
      cancelEdit();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to rename item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSoftDelete = async (item: EditableRecord) => {
    const confirmed = window.confirm(
      `Soft-delete "${item.name}"? This keeps history and can be recreated later.`
    );
    if (!confirmed) {
      return;
    }
    setBusyId(item.id);
    setActionError('');
    try {
      await onDeleteSoft(item.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleHardDelete = async (item: EditableRecord) => {
    const token = window.prompt(`Hard-delete "${item.name}" permanently. Type DELETE to confirm.`);
    if (token !== 'DELETE') {
      return;
    }
    setBusyId(item.id);
    setActionError('');
    try {
      await onDeleteHard(item.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to hard-delete item.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rk-surface rounded-xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[#fff0f2] border border-[#f3c6cc] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1f2937]">{title}</h2>
            <span className="text-xs text-[#9f1027] bg-[#fff0f2] border border-[#f3c6cc] px-2 py-0.5 rounded-md">
              {items.length}
            </span>
          </div>
          <p className="text-xs text-[#6b7280] mt-1">{description}</p>
        </div>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-auto pr-1">
        {items.length === 0 ? (
          <div className="flex items-center gap-2 text-[#6b7280] text-sm py-4">
            <AlertCircle size={14} />
            <span>No items yet. Add one below.</span>
          </div>
        ) : (
          items.map((item) => {
            const displayName =
              'location_type' in item
                ? `${locationTypeLabel(item.location_type)}: ${item.name}`
                : item.name;
            return (
              <div
                key={item.id}
                className="border border-[#f3c6cc] rounded-lg bg-white px-3 py-2.5 flex items-center gap-3"
              >
              {editingId === item.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="flex-1 bg-white border border-[#f3c6cc] rounded-md px-2.5 py-1.5 text-sm text-[#1f2937] focus:outline-none focus:border-[#c8102e]"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#1f2937] truncate">{displayName}</div>
                  <div className="text-[11px] text-[#6b7280]">
                    Linked inventory: <span className="text-[#9f1027]">{item.usage_count}</span>
                  </div>
                </div>
              )}

              {editingId === item.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => void handleSaveEdit(item.id)}
                    disabled={busyId === item.id}
                    className="px-2 py-1 rounded-md bg-[#c8102e] text-white text-xs font-semibold hover:bg-[#9f1027] transition-colors disabled:opacity-50"
                    title="Save"
                  >
                    <Save size={12} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-2 py-1 rounded-md border border-[#f3c6cc] text-[#9f1027] hover:text-[#c8102e] transition-colors"
                    title="Cancel"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => startEdit(item)}
                    className="px-2 py-1 rounded-md border border-[#f3c6cc] text-[#9f1027] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors"
                    title="Rename"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => void handleSoftDelete(item)}
                    disabled={busyId === item.id}
                    className="px-2 py-1 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Soft delete"
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    onClick={() => void handleHardDelete(item)}
                    disabled={busyId === item.id || item.usage_count > 0}
                    className="px-2 py-1 rounded-md border border-[#f3c6cc] text-[#9f1027] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors disabled:opacity-40"
                    title="Hard delete (test cleanup)"
                  >
                    Hard
                  </button>
                </div>
              )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canCreate && !creating) {
              event.preventDefault();
              void handleCreate();
            }
          }}
          placeholder={creatingLabel}
          className="flex-1 bg-white border border-[#f3c6cc] rounded-lg px-3 py-2 text-sm text-[#1f2937] placeholder-[#9ca3af] focus:outline-none focus:border-[#c8102e] transition-colors"
        />
        <button
          onClick={() => void handleCreate()}
          disabled={!canCreate || creating || loading}
          className="px-4 py-2 rounded-lg bg-[#c8102e] text-white text-sm font-semibold hover:bg-[#9f1027] transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {actionError && (
        <div className="mt-3 text-xs text-red-400 border border-red-500/30 bg-red-500/5 rounded-md px-3 py-2">
          {actionError}
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const {
    categories,
    locations,
    loading,
    error,
    reload,
    addCategory,
    addLocation,
    updateCategory,
    updateLocation,
    removeCategory,
    removeLocation,
  } = useReferenceData();

  const categoryItems = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const locationItems = useMemo(
    () =>
      [...locations].sort((a, b) => {
        const byType = locationTypeLabel(a.location_type).localeCompare(
          locationTypeLabel(b.location_type)
        );
        if (byType !== 0) {
          return byType;
        }
        return a.name.localeCompare(b.name);
      }),
    [locations]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#fff0f2] border border-[#f3c6cc] flex items-center justify-center">
              <Settings size={16} className="text-[#c8102e]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1f2937]">Reference Settings</h1>
              <p className="text-sm text-[#6b7280] mt-0.5">
                Manage categories and location dictionaries used throughout inventory workflows.
              </p>
            </div>
          </div>
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#f3c6cc] text-[#9f1027] hover:text-[#c8102e] hover:border-[#c8102e] transition-colors text-sm disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/5 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard
            title="Book Categories"
            icon={<Tag size={15} className="text-[#c8102e]" />}
            description="Used in title metadata, filters, reports, and scan/add forms."
            items={categoryItems}
            creatingLabel="Add category, e.g. Computer Science"
            onCreate={addCategory}
            onRename={updateCategory}
            onDeleteSoft={(id) => removeCategory(id, { mode: 'soft' })}
            onDeleteHard={(id) => removeCategory(id, { mode: 'hard', confirm: 'DELETE' })}
            loading={loading}
          />
          <SectionCard
            title="Locations"
            icon={<MapPin size={15} className="text-[#c8102e]" />}
            description="Used for location assignment, location filters, and inventory browsing."
            items={locationItems}
            creatingLabel="Add location, e.g. Warehouse: Main Warehouse"
            onCreate={addLocation}
            onRename={updateLocation}
            onDeleteSoft={(id) => removeLocation(id, { mode: 'soft' })}
            onDeleteHard={(id) => removeLocation(id, { mode: 'hard', confirm: 'DELETE' })}
            loading={loading}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
