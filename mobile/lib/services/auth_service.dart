import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import '../core/network/sync_api_client.dart';
import '../data/repositories/local_repository.dart';

class AuthService {
  AuthService({
    required LocalRepository repository,
    required SyncApiClient apiClient,
  })  : _repository = repository,
        _apiClient = apiClient;

  final LocalRepository _repository;
  final SyncApiClient _apiClient;
  final Random _random = Random.secure();

  Future<Map<String, dynamic>?> currentSession() {
    return _repository.readAuthSession();
  }

  String _randomSalt({int bytes = 16}) {
    final values = List<int>.generate(bytes, (_) => _random.nextInt(256));
    return base64UrlEncode(values);
  }

  String _hashPassword(String password, String salt) {
    final digest = sha256.convert(utf8.encode('$salt:$password'));
    return digest.toString();
  }

  bool _isLikelyOfflineFailure(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('socketexception') ||
        message.contains('clientexception') ||
        message.contains('failed host lookup') ||
        message.contains('connection refused') ||
        message.contains('connection reset') ||
        message.contains('connection abort') ||
        message.contains('software caused connection abort') ||
        message.contains('timed out') ||
        message.contains('os error') ||
        message.contains('network');
  }

  Future<Map<String, dynamic>> signIn({
    required String username,
    required String password,
  }) async {
    final normalizedUsername = username.trim();
    final cached = await _repository.readAuthSession();

    try {
      final response = await _apiClient.mobileLogin(
        username: normalizedUsername,
        password: password,
        deviceId: _repository.deviceId,
      );

      final token = (response['token'] as String?) ?? '';
      final role = (response['role'] as String?) ?? 'mobile';
      final expiresAt = (response['expires_at'] as String?) ??
          DateTime.now().toUtc().add(const Duration(days: 7)).toIso8601String();

      if (token.isEmpty) {
        throw Exception('Auth token missing from server response.');
      }

      final salt = _randomSalt();
      final passwordHash = _hashPassword(password, salt);

      await _repository.saveAuthSession(
        username: normalizedUsername,
        token: token,
        role: role,
        expiresAt: expiresAt,
        passwordHash: passwordHash,
        passwordSalt: salt,
      );

      return {
        'username': normalizedUsername,
        'token': token,
        'role': role,
        'expires_at': expiresAt,
        'offline_login': false,
      };
    } catch (error) {
      if (!_isLikelyOfflineFailure(error) || cached == null) {
        rethrow;
      }

      final cachedUsername = (cached['username'] as String?)?.trim() ?? '';
      final cachedSalt = (cached['password_salt'] as String?)?.trim() ?? '';
      final cachedHash = (cached['password_hash'] as String?)?.trim() ?? '';

      if (cachedUsername.isEmpty ||
          cachedSalt.isEmpty ||
          cachedHash.isEmpty ||
          cachedUsername.toLowerCase() != normalizedUsername.toLowerCase()) {
        throw Exception('Offline login unavailable for these credentials.');
      }

      final submittedHash = _hashPassword(password, cachedSalt);
      if (submittedHash != cachedHash) {
        throw Exception('Invalid credentials.');
      }

      final cachedToken = (cached['token'] as String?)?.trim() ?? '';
      final token = cachedToken.isNotEmpty
          ? cachedToken
          : 'offline:${DateTime.now().millisecondsSinceEpoch}';
      final role = ((cached['role'] as String?)?.trim().isNotEmpty ?? false)
          ? (cached['role'] as String)
          : 'mobile_offline';
      final expiresAt = DateTime.now()
          .toUtc()
          .add(const Duration(days: 30))
          .toIso8601String();

      await _repository.saveAuthSession(
        username: cachedUsername,
        token: token,
        role: role,
        expiresAt: expiresAt,
        passwordHash: cachedHash,
        passwordSalt: cachedSalt,
      );

      return {
        'username': cachedUsername,
        'token': token,
        'role': role,
        'expires_at': expiresAt,
        'offline_login': true,
      };
    }
  }

  Future<void> signOut() {
    return _repository.clearAuthSession();
  }

  Future<void> requestPasswordReset({
    required String email,
    required String phone,
  }) async {
    await _apiClient.requestPasswordReset(
      email: email.trim(),
      phone: phone.trim(),
      deviceId: _repository.deviceId,
    );
  }
}
