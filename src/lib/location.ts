export type LocationType = 'warehouse' | 'stock_room' | 'shelf';

export const LOCATION_TYPES: LocationType[] = ['warehouse', 'stock_room', 'shelf'];

export function normalizeLocationType(value: unknown): LocationType | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'warehouse') {
    return 'warehouse';
  }
  if (normalized === 'stock_room' || normalized === 'stock room') {
    return 'stock_room';
  }
  if (normalized === 'shelf') {
    return 'shelf';
  }
  return null;
}

export function locationTypeLabel(value: unknown): string {
  const normalized = normalizeLocationType(value);
  if (normalized === 'warehouse') {
    return 'Warehouse';
  }
  if (normalized === 'stock_room') {
    return 'Stock Room';
  }
  return 'Shelf';
}

export function normalizeLocationName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function composeLocation(args: {
  locationType?: unknown;
  locationName?: unknown;
  fallbackLocation?: unknown;
}): string | null {
  const locationName = normalizeLocationName(args.locationName);
  if (locationName) {
    const locationType = normalizeLocationType(args.locationType) ?? 'shelf';
    return `${locationTypeLabel(locationType)}: ${locationName}`;
  }

  const fallback = normalizeLocationName(args.fallbackLocation);
  return fallback;
}

export function parseLocation(args: {
  location?: unknown;
  locationType?: unknown;
  locationName?: unknown;
}): {
  location: string | null;
  locationType: LocationType | null;
  locationName: string | null;
} {
  const explicitName = normalizeLocationName(args.locationName);
  const explicitType = normalizeLocationType(args.locationType);
  const legacy = normalizeLocationName(args.location);

  if (explicitName) {
    const locationType = explicitType ?? 'shelf';
    return {
      location: composeLocation({ locationType, locationName: explicitName }),
      locationType,
      locationName: explicitName,
    };
  }

  if (!legacy) {
    return { location: null, locationType: null, locationName: null };
  }

  const colonIndex = legacy.indexOf(':');
  if (colonIndex > 0) {
    const prefix = legacy.slice(0, colonIndex).trim();
    const suffix = legacy.slice(colonIndex + 1).trim();
    const inferredType = normalizeLocationType(prefix);
    if (inferredType && suffix) {
      return {
        location: composeLocation({ locationType: inferredType, locationName: suffix }),
        locationType: inferredType,
        locationName: suffix,
      };
    }
  }

  return {
    location: legacy,
    locationType: explicitType ?? 'shelf',
    locationName: legacy,
  };
}
