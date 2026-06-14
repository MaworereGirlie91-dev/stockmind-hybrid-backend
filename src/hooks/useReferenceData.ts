'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { locationTypeLabel, normalizeLocationType } from '@/lib/location';
import { CategoryRecord, LocationRecord } from '@/types';

interface DeleteOptions {
  mode?: 'soft' | 'hard';
  confirm?: string;
}

interface ReferenceApiResponse<T> {
  items?: T[];
  item?: T;
  error?: string;
  in_use_count?: number;
}

async function parseJson<T>(res: Response): Promise<ReferenceApiResponse<T>> {
  return (await res.json().catch(() => ({}))) as ReferenceApiResponse<T>;
}

function sortLocations(list: LocationRecord[]): LocationRecord[] {
  return [...list].sort((a, b) => {
    const aType = locationTypeLabel(a.location_type).toLowerCase();
    const bType = locationTypeLabel(b.location_type).toLowerCase();
    const byType = aType.localeCompare(bType);
    if (byType !== 0) {
      return byType;
    }
    return a.name.localeCompare(b.name);
  });
}

export function useReferenceData() {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoriesRes, locationsRes] = await Promise.all([
        fetch('/api/reference/categories', { cache: 'no-store' }),
        fetch('/api/reference/locations', { cache: 'no-store' }),
      ]);

      const [categoriesJson, locationsJson] = await Promise.all([
        parseJson<CategoryRecord>(categoriesRes),
        parseJson<LocationRecord>(locationsRes),
      ]);

      if (!categoriesRes.ok) {
        throw new Error(categoriesJson.error ?? 'Failed to load categories.');
      }
      if (!locationsRes.ok) {
        throw new Error(locationsJson.error ?? 'Failed to load locations.');
      }

      setCategories((categoriesJson.items ?? []).filter((item) => item.deleted_at === null));
      setLocations(
        sortLocations(
          (locationsJson.items ?? []).filter((item) => item.deleted_at === null)
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reference data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addCategory = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('Category name is required.');
      }
      const res = await fetch('/api/reference/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await parseJson<CategoryRecord>(res);
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create category.');
      }
      if (json.item) {
        setCategories((prev) => [...prev, json.item!].sort((a, b) => a.name.localeCompare(b.name)));
      }
      return json.item;
    },
    []
  );

  const updateCategory = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Category name is required.');
    }
    const res = await fetch(`/api/reference/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    const json = await parseJson<CategoryRecord>(res);
    if (!res.ok) {
      throw new Error(json.error ?? 'Failed to update category.');
    }
    if (json.item) {
      setCategories((prev) =>
        prev
          .map((item) => (item.id === id ? json.item! : item))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return json.item;
  }, []);

  const removeCategory = useCallback(async (id: string, options?: DeleteOptions) => {
    const mode = options?.mode ?? 'soft';
    const res = await fetch(`/api/reference/categories/${id}?mode=${mode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: options?.confirm ?? '' }),
    });
    const json = await parseJson<CategoryRecord>(res);
    if (!res.ok) {
      const error = json.in_use_count
        ? `${json.error ?? 'Category is in use.'} (${json.in_use_count} linked records)`
        : json.error ?? 'Failed to delete category.';
      throw new Error(error);
    }
    setCategories((prev) => prev.filter((item) => item.id !== id));
    return true;
  }, []);

  const addLocation = useCallback(async (name: string, locationType?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Location name is required.');
    }
    const normalizedType = normalizeLocationType(locationType) ?? 'shelf';
    const res = await fetch('/api/reference/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, location_type: normalizedType }),
    });
    const json = await parseJson<LocationRecord>(res);
    if (!res.ok) {
      throw new Error(json.error ?? 'Failed to create location.');
    }
    if (json.item) {
      setLocations((prev) => sortLocations([...prev, json.item!]));
    }
    return json.item;
  }, []);

  const updateLocation = useCallback(async (id: string, name: string, locationType?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Location name is required.');
    }
    const normalizedType = normalizeLocationType(locationType);
    const res = await fetch(`/api/reference/locations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        ...(normalizedType ? { location_type: normalizedType } : {}),
      }),
    });
    const json = await parseJson<LocationRecord>(res);
    if (!res.ok) {
      throw new Error(json.error ?? 'Failed to update location.');
    }
    if (json.item) {
      setLocations((prev) => sortLocations(prev.map((item) => (item.id === id ? json.item! : item))));
    }
    return json.item;
  }, []);

  const removeLocation = useCallback(async (id: string, options?: DeleteOptions) => {
    const mode = options?.mode ?? 'soft';
    const res = await fetch(`/api/reference/locations/${id}?mode=${mode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: options?.confirm ?? '' }),
    });
    const json = await parseJson<LocationRecord>(res);
    if (!res.ok) {
      const error = json.in_use_count
        ? `${json.error ?? 'Location is in use.'} (${json.in_use_count} linked records)`
        : json.error ?? 'Failed to delete location.';
      throw new Error(error);
    }
    setLocations((prev) => prev.filter((item) => item.id !== id));
    return true;
  }, []);

  const categoryOptions = useMemo(
    () => categories.map((item) => item.name).sort((a, b) => a.localeCompare(b)),
    [categories]
  );
  const locationOptions = useMemo(
    () =>
      locations.map((item) => `${locationTypeLabel(item.location_type)}: ${item.name}`),
    [locations]
  );

  return {
    categories,
    locations,
    categoryOptions,
    locationOptions,
    loading,
    ready: !loading,
    error,
    reload,
    addCategory,
    updateCategory,
    removeCategory,
    addLocation,
    updateLocation,
    removeLocation,
  };
}
