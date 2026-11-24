package app.yardobs.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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
    private static final String PREF_USED_URL = "usedUrl";
    private static final long RETRY_MS = 30_000;

    private WebView webView;
    private boolean loadFailed;
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
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                loadFailed = false;
            }

            // A good load cancels a retry left over from an earlier failure.
            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loadFailed) handler.removeCallbacks(retry);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) scheduleRetry();
            }

            // A server error (e.g. a 5xx during a deploy) isn't a network
            // error, but an unattended screen should still recover from it.
            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) scheduleRetry();
            }
        });

        setContentView(webView);
        hideSystemUi();

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(startUrl(getIntent(), false));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = intent.getStringExtra("url");
        if (url != null) webView.loadUrl(startUrl(intent, true));
    }

    private void scheduleRetry() {
        loadFailed = true;
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    // The url extra if one was given (remembering its origin as home),
    // otherwise the saved home.
    //
    // Each link is used once. Android can recreate the activity from the same
    // launch intent later (after the process was killed, or a reboot), and the
    // link must not reopen and reset the size then, so a fresh start ignores
    // the link it last used. A link sent while the app is open (onNewIntent)
    // always applies.
    private String startUrl(Intent intent, boolean isNewIntent) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = intent == null ? null : intent.getStringExtra("url");
        if (url != null && !isNewIntent && url.equals(prefs.getString(PREF_USED_URL, null))) url = null;
        if (url != null) {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme()) && u.getHost() != null) {
                String home = "https://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") + "/";
                prefs.edit().putString(PREF_HOME, home).putString(PREF_USED_URL, url).apply();
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
        if (loadFailed) scheduleRetry();
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(retry);
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
