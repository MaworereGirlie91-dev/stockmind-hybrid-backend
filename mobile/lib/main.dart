import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'services/app_state.dart';
import 'ui/screens/app_shell.dart';
import 'ui/screens/login_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await dotenv.load(fileName: '.env');
  } catch (_) {
    await dotenv.load(fileName: '.env.example');
  }

  final appStateFuture = AppState.bootstrap();
  await Future.wait<void>([
    appStateFuture.then((_) {}),
    Future<void>.delayed(const Duration(milliseconds: 900)),
  ]);

  final appState = await appStateFuture;
  runApp(StockMindMobileApp(appState: appState));
}

class StockMindMobileApp extends StatefulWidget {
  const StockMindMobileApp({super.key, required this.appState});

  final AppState appState;

  @override
  State<StockMindMobileApp> createState() => _StockMindMobileAppState();
}

class _StockMindMobileAppState extends State<StockMindMobileApp> {
  static const Duration _backgroundLogoutDelay = Duration(seconds: 30);

  Timer? _backgroundLogoutTimer;
  DateTime? _backgroundEnteredAt;
  bool _isBackgrounded = false;
  bool _autoLogoutInProgress = false;

  @override
  void initState() {
    super.initState();
    _lifecycleObserver.onChanged = _onLifecycleChanged;
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
  }

  final _StockMindLifecycleObserver _lifecycleObserver =
      _StockMindLifecycleObserver();

  void _onLifecycleChanged(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final enteredAt = _backgroundEnteredAt;
      _isBackgrounded = false;
      _backgroundLogoutTimer?.cancel();
      _backgroundLogoutTimer = null;

      if (enteredAt != null &&
          DateTime.now().difference(enteredAt) >= _backgroundLogoutDelay) {
        unawaited(_triggerAutoLogout());
      }
      _backgroundEnteredAt = null;
      return;
    }

    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _startBackgroundLogoutWindow();
    }
  }

  void _startBackgroundLogoutWindow() {
    if (!widget.appState.isLoggedIn) {
      return;
    }

    _isBackgrounded = true;
    _backgroundEnteredAt ??= DateTime.now();
    _backgroundLogoutTimer?.cancel();
    _backgroundLogoutTimer = Timer(_backgroundLogoutDelay, () {
      if (!mounted || !_isBackgrounded) {
        return;
      }
      unawaited(_triggerAutoLogout());
    });
  }

  Future<void> _triggerAutoLogout() async {
    if (_autoLogoutInProgress || !widget.appState.isLoggedIn) {
      return;
    }
    _autoLogoutInProgress = true;
    try {
      await widget.appState.signOut();
    } finally {
      _autoLogoutInProgress = false;
      _isBackgrounded = false;
      _backgroundEnteredAt = null;
      _backgroundLogoutTimer?.cancel();
      _backgroundLogoutTimer = null;
    }
  }

  @override
  void dispose() {
    _lifecycleObserver.onChanged = null;
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    _backgroundLogoutTimer?.cancel();
    _backgroundLogoutTimer = null;
    widget.appState.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.appState,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'StockMind Mobile',
          theme: AppTheme.lightTheme(),
          home: widget.appState.loading
              ? const _BootScreen()
              : widget.appState.isLoggedIn
                  ? AppShell(appState: widget.appState)
                  : LoginScreen(appState: widget.appState),
        );
      },
    );
  }
}

class _StockMindLifecycleObserver extends WidgetsBindingObserver {
  _StockMindLifecycleObserver();

  void Function(AppLifecycleState state)? onChanged;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    onChanged?.call(state);
  }
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppTheme.border),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x1AC8102E),
                    blurRadius: 18,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(10),
              child: Image.asset('assets/branding/aiec-logo.png'),
            ),
            const SizedBox(height: 14),
            const Text(
              'StockMind',
              style: TextStyle(
                color: AppTheme.foreground,
                fontWeight: FontWeight.w800,
                fontSize: 20,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Preparing local database and sync engine...',
              style: TextStyle(color: AppTheme.muted),
            ),
            const SizedBox(height: 16),
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: AppTheme.brand,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
