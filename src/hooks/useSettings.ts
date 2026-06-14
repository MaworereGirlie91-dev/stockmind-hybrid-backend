'use client';

import { useCallback, useMemo } from 'react';

import { useReferenceData } from '@/hooks/useReferenceData';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function useSettings() {
  const references = useReferenceData();

  const categories = useMemo(() => references.categoryOptions, [references.categoryOptions]);
  const locations = useMemo(() => references.locationOptions, [references.locationOptions]);

  const addCategory = useCallback(
    (name: string) => {
      void references.addCategory(name).catch(() => {});
    },
    [references]
  );

  const removeCategory = useCallback(
    (name: string) => {
      const match = references.categories.find((item) => normalize(item.name) === normalize(name));
      if (!match) {
        return;
      }
      void references.removeCategory(match.id).catch(() => {});
    },
    [references]
  );

  const addLocation = useCallback(
    (name: string, locationType?: string) => {
      void references.addLocation(name, locationType).catch(() => {});
    },
    [references]
  );

  const removeLocation = useCallback(
    (name: string) => {
      const normalizedName = normalize(name.includes(':') ? name.split(':').slice(1).join(':') : name);
      const match = references.locations.find((item) => normalize(item.name) === normalizedName);
      if (!match) {
        return;
      }
      void references.removeLocation(match.id).catch(() => {});
    },
    [references]
  );

  return {
    categories,
    locations,
    addCategory,
    removeCategory,
    addLocation,
    removeLocation,
    ready: references.ready,
    loading: references.loading,
    error: references.error,
    reload: references.reload,
    categoryRecords: references.categories,
    locationRecords: references.locations,
    updateCategory: references.updateCategory,
    updateLocation: references.updateLocation,
    removeCategoryById: references.removeCategory,
    removeLocationById: references.removeLocation,
  };
}
