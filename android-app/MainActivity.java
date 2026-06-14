// ============================================================
// StockMind Android WebView Wrapper
// File: android-app/app/src/main/java/com/robokorda/stockmind/MainActivity.java
// ============================================================
// Drop this into a new Android Studio project (Empty Activity).
// minSdk = 26, targetSdk = 34
//
// 1.  Add your UHF RFID SDK .aar to app/libs/
// 2.  In app/build.gradle add:
//       implementation fileTree(dir: 'libs', include: ['*.aar', '*.jar'])
//       implementation 'androidx.webkit:webkit:1.8.0'
// 3.  In AndroidManifest.xml add INTERNET permission
// 4.  Change WEB_APP_URL to your local/production URL
// ============================================================

package com.robokorda.stockmind;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

// ── Replace these imports with the actual UHF SDK package from your device manufacturer
// import com.uhf.sdk.RFIDReader;
// import com.uhf.sdk.ScanCallback;

public class MainActivity extends AppCompatActivity {

    // Legacy WebView fallback only. The primary field app is now Flutter.
    // WEB_APP_URL comes from build.gradle buildConfigField.
    private static final String WEB_APP_URL =
            (BuildConfig.WEB_APP_URL != null && !BuildConfig.WEB_APP_URL.trim().isEmpty())
                    ? BuildConfig.WEB_APP_URL
                    : "http://192.168.1.100:3000/scan";

    private WebView webView;

    // Uncomment when UHF SDK is available:
    // private RFIDReader rfidReader;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full-screen WebView as the only view
        webView = new WebView(this);
        setContentView(webView);

        // ── WebView configuration ──────────────────────────────────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Optionally inject a startup message
                webView.evaluateJavascript("console.log('StockMind WebView ready');", null);
            }
        });

        webView.loadUrl(WEB_APP_URL);

        // ── RFID SDK initialisation ────────────────────────────────────────────
        // Uncomment and adapt to your specific UHF SDK:
        //
        // rfidReader = new RFIDReader(this);
        // rfidReader.setCallback(new ScanCallback() {
        //     @Override
        //     public void onTagScanned(String epc) {
        //         runOnUiThread(() -> injectEpc(epc));
        //     }
        // });
        // rfidReader.open();
    }

    /**
     * Injects a scanned EPC tag into the WebView's JavaScript context.
     * This calls window.onRFIDScan(epc) which is registered by the Next.js app.
     *
     * @param epc The Electronic Product Code read from the UHF tag
     */
    public void injectEpc(String epc) {
        if (epc == null || epc.trim().isEmpty()) return;

        // Sanitise – remove any single quotes to avoid JS injection
        String safeEpc = epc.replace("'", "\\'").trim();

        webView.evaluateJavascript(
            "if(typeof window.onRFIDScan === 'function') { window.onRFIDScan('" + safeEpc + "'); }",
            null
        );

        Toast.makeText(this, "Tag scanned: " + safeEpc, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        // rfidReader.close(); // Uncomment when SDK is active
        super.onDestroy();
        webView.destroy();
    }
}
