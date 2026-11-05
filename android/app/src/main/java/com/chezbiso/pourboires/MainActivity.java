package com.chezbiso.pourboires;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Appli « Pourboires chez Biso » : affiche le site du serveur en plein écran.
 * Aucune donnée n'est stockée dans l'appli, à part l'adresse du serveur et le cookie de connexion.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "biso";
    private static final String KEY_URL = "server_url";
    private static final String ASSET_PREFIX = "file:///android_asset/";

    private WebView web;
    private SharedPreferences prefs;
    /** Vrai quand la page affichée est une page de l'appli (réglage / erreur), pas le serveur. */
    private volatile boolean showingLocalPage = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#1867C0"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySystemBarInsets(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " PourboiresBisoAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new Bridge(), "BisoApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) return;
        start();
    }

    /** Laisse de la place pour la barre d'état, la barre de navigation et le clavier (Android 15 : plein écran imposé). */
    private void applySystemBarInsets(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            }
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
    }

    private String savedUrl() {
        return prefs.getString(KEY_URL, null);
    }

    private void start() {
        String url = savedUrl();
        if (url == null) showSetup(BuildConfig.DEFAULT_SERVER, "");
        else loadServer(url);
    }

    private void loadServer(String url) {
        showingLocalPage = false;
        web.loadUrl(url);
    }

    /** Page de l'appli : saisie de l'adresse du serveur, ou message d'erreur avec « Réessayer ». */
    private void showSetup(String url, String error) {
        showingLocalPage = true;
        web.loadUrl(ASSET_PREFIX + "setup.html?url=" + Uri.encode(url == null ? "" : url)
                + "&err=" + Uri.encode(error == null ? "" : error)
                + "&saved=" + (savedUrl() != null ? "1" : "0"));
    }

    /** Normalise l'adresse saisie : http(s)://hôte[:port], sans « / » final. Null si invalide. */
    static String normalize(String input) {
        if (input == null) return null;
        String u = input.trim();
        if (u.isEmpty()) return null;
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        Uri parsed = Uri.parse(u);
        if (parsed.getHost() == null || parsed.getHost().isEmpty()) return null;
        return u;
    }

    private boolean isOurServer(Uri uri) {
        String saved = savedUrl();
        if (saved == null) return false;
        Uri s = Uri.parse(saved);
        return s.getHost() != null && s.getHost().equalsIgnoreCase(uri.getHost())
                && s.getPort() == uri.getPort() && s.getScheme() != null && s.getScheme().equalsIgnoreCase(uri.getScheme());
    }

    /** Fonctions appelées par les pages (window.BisoApp). */
    private class Bridge {
        /** Enregistre l'adresse du serveur (uniquement depuis la page de réglage de l'appli). */
        @JavascriptInterface
        public boolean save(String input) {
            if (!showingLocalPage) return false;
            String url = normalize(input);
            if (url == null) return false;
            prefs.edit().putString(KEY_URL, url).apply();
            runOnUiThread(() -> loadServer(url));
            return true;
        }

        /** Réessayer avec l'adresse enregistrée. */
        @JavascriptInterface
        public void retry() {
            runOnUiThread(MainActivity.this::start);
        }

        /** Ouvrir la page de réglage (aussi proposé dans le menu du compte de l'application). */
        @JavascriptInterface
        public void changeServer() {
            runOnUiThread(() -> {
                String saved = savedUrl();
                showSetup(saved != null ? saved : BuildConfig.DEFAULT_SERVER, "");
            });
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri.toString().startsWith(ASSET_PREFIX)) return false;
            if (isOurServer(uri)) return false;
            // Lien extérieur : ouvert dans le navigateur du téléphone.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                // aucun navigateur
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            showingLocalPage = url != null && url.startsWith(ASSET_PREFIX);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            if (request.getUrl().toString().startsWith(ASSET_PREFIX)) return;
            String saved = savedUrl();
            showSetup(saved != null ? saved : BuildConfig.DEFAULT_SERVER,
                    "Serveur injoignable (" + error.getDescription() + "). Vérifiez la connexion internet ou l'adresse.");
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // garder la connexion après fermeture de l'appli
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("BisoApp");
            web.destroy();
        }
        super.onDestroy();
    }
}
