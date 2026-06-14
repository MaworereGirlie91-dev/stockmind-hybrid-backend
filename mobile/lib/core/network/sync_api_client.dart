import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class SyncApiClient {
  SyncApiClient({http.Client? httpClient})
      : _httpClient = httpClient ?? http.Client();

  final http.Client _httpClient;

  Uri _uri(String path) => Uri.parse('${AppConfig.syncBaseUrl}$path');

  Map<String, String> _headers({String? bearerToken, String? deviceId}) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    final apiToken = AppConfig.syncApiToken;
    if (apiToken != null) {
      headers['x-sync-token'] = apiToken;
    }
    if (bearerToken != null && bearerToken.trim().isNotEmpty) {
      headers['Authorization'] = 'Bearer $bearerToken';
    }
    if (deviceId != null && deviceId.trim().isNotEmpty) {
      headers['x-device-id'] = deviceId;
    }

    return headers;
  }

  Future<Map<String, dynamic>> mobileLogin({
    required String username,
    required String password,
    required String deviceId,
  }) async {
    final res = await _httpClient.post(
      _uri('/api/mobile/auth/login'),
      headers: _headers(deviceId: deviceId),
      body: jsonEncode({
        'username': username,
        'password': password,
        'device_id': deviceId,
      }),
    );

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(json['error'] ?? 'Mobile login failed.');
    }
    return json;
  }

  Future<Map<String, dynamic>> requestPasswordReset({
    required String email,
    required String phone,
    required String deviceId,
  }) async {
    final res = await _httpClient.post(
      _uri('/api/mobile/auth/request-reset'),
      headers: _headers(deviceId: deviceId),
      body: jsonEncode({
        'email': email,
        'phone': phone,
        'device_id': deviceId,
      }),
    );

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(json['error'] ?? 'Password reset request failed.');
    }
    return json;
  }

  Future<Map<String, dynamic>> push({
    required String deviceId,
    required List<Map<String, dynamic>> operations,
    String? bearerToken,
  }) async {
    final res = await _httpClient.post(
      _uri('/api/sync/push'),
      headers: _headers(bearerToken: bearerToken, deviceId: deviceId),
      body: jsonEncode({
        'device_id': deviceId,
        'operations': operations,
      }),
    );

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(json['error'] ?? 'Sync push failed.');
    }
    return json;
  }

  Future<Map<String, dynamic>> pull({
    required String deviceId,
    required Map<String, String> checkpoints,
    String? bearerToken,
    int limit = 1000,
  }) async {
    final res = await _httpClient.post(
      _uri('/api/sync/pull'),
      headers: _headers(bearerToken: bearerToken, deviceId: deviceId),
      body: jsonEncode({
        'device_id': deviceId,
        'checkpoints': checkpoints,
        'limit': limit,
      }),
    );

    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(json['error'] ?? 'Sync pull failed.');
    }
    return json;
  }

  void dispose() {
    _httpClient.close();
  }
}
