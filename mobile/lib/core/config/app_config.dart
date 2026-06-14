import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  const AppConfig._();

  static String get syncBaseUrl {
    final raw = dotenv.env['SYNC_BASE_URL']?.trim();
    if (raw == null || raw.isEmpty) {
      throw StateError('SYNC_BASE_URL is missing in mobile/.env');
    }
    return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
  }

  static String? get syncApiToken {
    final raw = dotenv.env['SYNC_API_TOKEN']?.trim();
    if (raw == null || raw.isEmpty) {
      return null;
    }
    return raw;
  }
}
