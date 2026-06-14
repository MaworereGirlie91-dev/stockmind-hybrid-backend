import 'package:flutter/material.dart';

import '../../services/app_state.dart';
import '../theme.dart';
import '../tabs/inventory_tab.dart';
import '../tabs/reports_tab.dart';
import '../tabs/sales_tab.dart';
import '../tabs/scan_add_tab.dart';
import '../tabs/stock_count_tab.dart';
import '../widgets/sync_status_chip.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.appState});

  final AppState appState;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final tabs = [
      InventoryTab(appState: widget.appState),
      ScanAddTab(appState: widget.appState),
      SalesTab(appState: widget.appState),
      StockCountTab(appState: widget.appState),
      ReportsTab(appState: widget.appState),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 14,
        title: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: Colors.white,
                border: Border.all(color: AppTheme.border),
              ),
              padding: const EdgeInsets.all(4),
              child: Image.asset('assets/branding/aiec-logo.png'),
            ),
            const Expanded(
              child: Text(
                'StockMind',
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 10),
            SyncStatusChip(
                snapshot: widget.appState.syncSnapshot, compact: true),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Sync now',
            onPressed: !widget.appState.canSync
                ? null
                : () => widget.appState.syncNow(),
            icon: const Icon(Icons.sync, color: Colors.white),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => widget.appState.signOut(),
            icon: const Icon(Icons.logout, color: Colors.white),
          ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: KeyedSubtree(
          key: ValueKey<int>(_index),
          child: tabs[_index],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.inventory_2_outlined), label: 'Inventory'),
          NavigationDestination(
              icon: Icon(Icons.qr_code_scanner_rounded), label: 'Scan/Add'),
          NavigationDestination(
              icon: Icon(Icons.point_of_sale_outlined), label: 'Sales'),
          NavigationDestination(
              icon: Icon(Icons.fact_check_outlined), label: 'Stock Count'),
          NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
        ],
      ),
    );
  }
}
