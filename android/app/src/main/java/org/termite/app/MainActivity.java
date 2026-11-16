package org.termite.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Termite for Android: the Termite page in a WebView, with phone file picking, saving to Downloads and the share menu. */
public class MainActivity extends Activity {
    private static final int PICK = 41;
    private static final String HOME = "https://appassets.androidplatform.net/assets/index.html";
    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { toast("No app can open that link."); }
                return true;
            }
            @Override
            public void onPageFinished(WebView v, String url) { deliver(getIntent()); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                boolean images = false;
                for (String t : p.getAcceptTypes()) if (t != null && t.startsWith("image")) images = true;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(images ? "image/*" : "*/*");
                if (!images) i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword",
                        "text/plain", "text/html", "text/markdown", "application/octet-stream"});
                try { startActivityForResult(Intent.createChooser(i, "Open with Termite"), PICK); }
                catch (Exception e) { pending = null; toast("No file picker found."); return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "TermiteAndroid");
        web.loadUrl(HOME);
    }

    @Override
    protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); deliver(intent); }

    /** A PDF or Word file opened from another app ("Open with Termite") goes straight into the page. */
    private void deliver(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return;
        Uri u = intent.getData();
        intent.setAction(Intent.ACTION_MAIN);
        try (InputStream in = getContentResolver().openInputStream(u)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            String b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            String js = "(async()=>{while(!window.termite||!termite.openBytes)await new Promise(r=>setTimeout(r,200));termite.openBytes("
                    + JSONObject.quote(b64) + "," + JSONObject.quote(nameOf(u)) + ");})()";
            web.evaluateJavascript(js, null);
        } catch (Exception e) { toast("Couldn't open that file."); }
    }

    private String nameOf(Uri u) {
        String name = null;
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) name = c.getString(0);
        } catch (Exception ignored) {}
        if (name == null) name = u.getLastPathSegment();
        if (name == null) name = "document.pdf";
        String type = getContentResolver().getType(u);
        if (!name.contains(".") && type != null) name += type.contains("pdf") ? ".pdf" : type.contains("word") ? ".docx" : "";
        return name;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && pending != null) {
            Uri[] r = (res == RESULT_OK && data != null && data.getData() != null) ? new Uri[]{data.getData()} : null;
            pending.onReceiveValue(r);
            pending = null;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    private void toast(final String m) { runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    private static String safe(String n) {
        String s = n == null ? "document" : n.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return s.isEmpty() ? "document" : s;
    }

    class Bridge {
        /** Saves into the phone's Downloads folder. Returns "ok:<where>" or "error:<reason>". */
        @JavascriptInterface
        public String save(String b64, String name, String mime) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                name = safe(name);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) return "error:the Downloads folder refused the file";
                    try (OutputStream o = cr.openOutputStream(u)) { o.write(data); }
                    return "ok:Downloads";
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) dir = getFilesDir();
                    File f = new File(dir, name);
                    try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
                    return "ok:" + f.getParent();
                }
            } catch (Exception e) { return "error:" + e.getMessage(); }
        }

        /** Opens Android's share menu (WhatsApp, Gmail, Bluetooth, Nearby Share…) with the file attached. */
        @JavascriptInterface
        public String share(String b64, String name, String mime) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "share");
                if (!dir.exists() && !dir.mkdirs()) return "error:no space";
                File f = new File(dir, safe(name));
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
                final Uri u = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                send.putExtra(Intent.EXTRA_STREAM, u);
                send.putExtra(Intent.EXTRA_SUBJECT, f.getName());
                send.setClipData(ClipData.newRawUri(f.getName(), u));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, "Send " + f.getName())));
                return "ok";
            } catch (Exception e) { toast("Couldn't share: " + e.getMessage()); return "error:" + e.getMessage(); }
        }
    }
}
