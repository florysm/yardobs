package app.yardobs.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// YardObs for Google TV / Android TV: a full-screen WebView on the hosted app.
//
// The web app already has a Dashboard mode (?dashboard=large|normal|detailed)
// and "Set up another device" links (#setup=…), so this wrapper only has to:
//  - keep the screen on (TVs drop into a screensaver otherwise);
//  - keep localStorage, where the web app saves the station, key and layout;
//  - retry when the network isn't up yet (e.g. right after the TV wakes).
//
// First-time setup from a computer, with a setup link made in Settings on
// your phone (see tv/README.md):
//   adb shell am start -n app.yardobs.tv/.MainActivity \
//     --es url 'https://yardobs.app/?dashboard=large#setup=…'
//
// The url extra is opened once. Afterwards the app opens the plain origin
// (e.g. https://yardobs.app/), because the web app has saved everything the
// link carried; reopening the full link would reset the size on every launch.
public class MainActivity extends Activity {
    private static final String DEFAULT_HOME = "https://yardobs.app/";
    private static final String PREFS = "yardobs";
    private static final String PREF_HOME = "home";
    private static final long RETRY_MS = 30_000;

    private WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable retry = () -> { if (webView != null) webView.reload(); };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF2D5A3D);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage: station, key, layout
        s.setMediaPlaybackRequiresUserGesture(true);
        // Lets the web app tell it's running on the TV (see isInstalledApp in App.jsx).
        s.setUserAgentString(s.getUserAgentString() + " YardObsTV/" + BuildConfig.VERSION_NAME);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    handler.removeCallbacks(retry);
                    handler.postDelayed(retry, RETRY_MS);
                }
            }
        });

        setContentView(webView);
        hideSystemUi();

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(startUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = intent.getStringExtra("url");
        if (url != null) webView.loadUrl(startUrl(intent));
    }

    // The url extra if one was given (remembering its origin as home),
    // otherwise the saved home.
    private String startUrl(Intent intent) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = intent == null ? null : intent.getStringExtra("url");
        if (url != null) {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme()) && u.getHost() != null) {
                String home = "https://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") + "/";
                prefs.edit().putString(PREF_HOME, home).apply();
                return url;
            }
        }
        return prefs.getString(PREF_HOME, DEFAULT_HOME);
    }

    private void hideSystemUi() {
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(retry);
        webView.destroy();
        super.onDestroy();
    }
}
