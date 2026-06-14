const String kLocationTypeWarehouse = 'warehouse';
const String kLocationTypeStockRoom = 'stock_room';
const String kLocationTypeShelf = 'shelf';

const List<String> kLocationTypes = <String>[
  kLocationTypeWarehouse,
  kLocationTypeStockRoom,
  kLocationTypeShelf,
];

String? normalizeLocationType(String? value) {
  final normalized = (value ?? '').trim().toLowerCase();
  if (normalized == kLocationTypeWarehouse) {
    return kLocationTypeWarehouse;
  }
  if (normalized == kLocationTypeStockRoom) {
    return kLocationTypeStockRoom;
  }
  if (normalized == kLocationTypeShelf) {
    return kLocationTypeShelf;
  }
  if (normalized == 'stock room') {
    return kLocationTypeStockRoom;
  }
  return null;
}

String locationTypeLabel(String? value) {
  switch (normalizeLocationType(value)) {
    case kLocationTypeWarehouse:
      return 'Warehouse';
    case kLocationTypeStockRoom:
      return 'Stock Room';
    case kLocationTypeShelf:
    default:
      return 'Shelf';
  }
}

String? normalizeLocationName(String? value) {
  final trimmed = (value ?? '').trim();
  return trimmed.isEmpty ? null : trimmed;
}

String? composeLocation({
  String? locationType,
  String? locationName,
  String? fallbackLocation,
}) {
  final name = normalizeLocationName(locationName);
  if (name != null) {
    final type = normalizeLocationType(locationType) ?? kLocationTypeShelf;
    return '${locationTypeLabel(type)}: $name';
  }
  final fallback = normalizeLocationName(fallbackLocation);
  return fallback;
}

class ParsedLocation {
  const ParsedLocation({
    required this.location,
    required this.locationType,
    required this.locationName,
  });

  final String? location;
  final String? locationType;
  final String? locationName;
}

ParsedLocation parseLocation({
  String? location,
  String? locationType,
  String? locationName,
}) {
  final normalizedName = normalizeLocationName(locationName);
  final normalizedType = normalizeLocationType(locationType);
  final normalizedLocation = normalizeLocationName(location);

  if (normalizedName != null) {
    final resolvedType = normalizedType ?? kLocationTypeShelf;
    return ParsedLocation(
      location: composeLocation(
        locationType: resolvedType,
        locationName: normalizedName,
      ),
      locationType: resolvedType,
      locationName: normalizedName,
    );
  }

  if (normalizedLocation == null) {
    return const ParsedLocation(
      location: null,
      locationType: null,
      locationName: null,
    );
  }

  final parts = normalizedLocation.split(':');
  if (parts.length >= 2) {
    final rawType = parts.first.trim().toLowerCase();
    final parsedType = normalizeLocationType(rawType == 'stock room'
        ? kLocationTypeStockRoom
        : rawType);
    final parsedName = parts.sublist(1).join(':').trim();
    if (parsedType != null && parsedName.isNotEmpty) {
      return ParsedLocation(
        location: composeLocation(
          locationType: parsedType,
          locationName: parsedName,
        ),
        locationType: parsedType,
        locationName: parsedName,
      );
    }
  }

  return ParsedLocation(
    location: normalizedLocation,
    locationType: normalizedType ?? kLocationTypeShelf,
    locationName: normalizedLocation,
  );
}
