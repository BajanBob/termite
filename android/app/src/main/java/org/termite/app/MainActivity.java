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
    private static final int MIC = 42;
    private android.webkit.PermissionRequest micRequest;

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == MIC && micRequest != null) {
            if (results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) micRequest.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else { micRequest.deny(); toast("Microphone not allowed, so recording is off."); }
            micRequest = null;
        }
    }

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
            public void onPermissionRequest(final android.webkit.PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean audioOnly = true;
                    for (String r : req.getResources()) if (!android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audioOnly = false;
                    if (!audioOnly || !"appassets.androidplatform.net".equals(req.getOrigin().getHost())) { req.deny(); return; }
                    if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        micRequest = req; requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, MIC);
                    } else req.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                });
            }
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                java.util.ArrayList<String> media = new java.util.ArrayList<>();
                boolean other = false;
                for (String t : p.getAcceptTypes()) {
                    if (t == null || t.trim().isEmpty()) continue;
                    for (String one : t.split(",")) { one = one.trim();
                        if (one.startsWith("image") || one.startsWith("video") || one.startsWith("audio")) media.add(one.contains("/") ? one : one + "/*"); else other = true; }
                }
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (!media.isEmpty() && !other) i.putExtra(Intent.EXTRA_MIME_TYPES, media.toArray(new String[0]));
                else if (!other && media.isEmpty()) { /* any file */ }
                else i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword",
                        "text/plain", "text/csv", "text/comma-separated-values", "text/html", "text/markdown", "application/json", "application/octet-stream"});
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Choose a file"), PICK); }
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
            Uri[] r = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) { int n = data.getClipData().getItemCount(); r = new Uri[n]; for (int k = 0; k < n; k++) r[k] = data.getClipData().getItemAt(k).getUri(); }
                else if (data.getData() != null) r = new Uri[]{data.getData()};
            }
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

    private static final java.util.regex.Pattern AI_HOSTS = java.util.regex.Pattern.compile(
            "^https://(api\\.anthropic\\.com|api\\.venice\\.ai|openrouter\\.ai|api\\.groq\\.com|api\\.elevenlabs\\.io|generativelanguage\\.googleapis\\.com)/.*|^http://(localhost|127\\.0\\.0\\.1):11434/.*");

    class Bridge {
        /** Kiosk's AI requests (Venice, Groq, Gemini, OpenRouter, Anthropic, Ollama). Answers via termiteNetDone(id, status, text). */
        @JavascriptInterface
        public void http(final int id, final String url, final String method, final String headersJson, final String body) { request(id, url, method, headersJson, body, false); }

        /** Same as http, for audio: the reply's body comes back base64-encoded via termiteNetDoneBinary. */
        @JavascriptInterface
        public void httpBinary(final int id, final String url, final String method, final String headersJson, final String body) { request(id, url, method, headersJson, body, true); }

        private void request(final int id, final String url, final String method, final String headersJson, final String body, final boolean binary) {
            new Thread(() -> {
                int status = 0; String text;
                try {
                    if (!AI_HOSTS.matcher(url).matches()) throw new Exception("Termite only talks to known AI services.");
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setRequestMethod(method); c.setConnectTimeout(20000); c.setReadTimeout(180000);
                    JSONObject h = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
                    java.util.Iterator<String> it = h.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    if (!"GET".equals(method) && body != null && !body.isEmpty()) { c.setDoOutput(true); try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes("UTF-8")); } }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream(); if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); in.close(); }
                    text = binary && status < 400 ? Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP) : out.toString("UTF-8");
                } catch (Exception e) { text = "{\"error\":{\"message\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}}"; }
                final String js = (binary && status > 0 && status < 400 ? "window.termiteNetDoneBinary(" : "window.termiteNetDone(") + id + "," + status + "," + JSONObject.quote(text) + ")";
                runOnUiThread(() -> web.evaluateJavascript(js, null));
            }).start();
        }

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

        /** Sends the file straight to one app (e.g. com.whatsapp). Returns "ok", "missing" or "error:…". */
        @JavascriptInterface
        public String shareTo(String b64, String name, String mime, String pkg) {
            try {
                final Uri u = writeShareFile(Base64.decode(b64, Base64.DEFAULT), name);
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                send.putExtra(Intent.EXTRA_STREAM, u);
                send.setClipData(ClipData.newRawUri(name, u));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setPackage(pkg);
                if (send.resolveActivity(getPackageManager()) == null) return "missing";
                runOnUiThread(() -> { try { startActivity(send); } catch (Exception e) { toast("Couldn't open that app."); } });
                return "ok";
            } catch (Exception e) { return "error:" + e.getMessage(); }
        }

        /** Sends several pictures to one app (e.g. Facebook), or to the share menu if it isn't installed. */
        @JavascriptInterface
        public String shareImages(String jsonList, String baseName, String pkg) {
            try {
                org.json.JSONArray arr = new org.json.JSONArray(jsonList);
                final java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
                ClipData clip = null;
                for (int i = 0; i < arr.length(); i++) {
                    Uri u = writeShareFile(Base64.decode(arr.getString(i), Base64.DEFAULT), safe(baseName) + " " + (i + 1) + ".jpg");
                    uris.add(u);
                    if (clip == null) clip = ClipData.newRawUri("page", u); else clip.addItem(new ClipData.Item(u));
                }
                final Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
                send.setType("image/jpeg");
                if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0)); else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                send.setClipData(clip);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String result = "fallback";
                if (pkg != null && !pkg.isEmpty()) { send.setPackage(pkg); if (send.resolveActivity(getPackageManager()) != null) result = "ok"; else send.setPackage(null); }
                final boolean direct = "ok".equals(result);
                runOnUiThread(() -> startActivity(direct ? send : Intent.createChooser(send, "Post with")));
                return result;
            } catch (Exception e) { toast("Couldn't share the pictures: " + e.getMessage()); return "error:" + e.getMessage(); }
        }

        private Uri writeShareFile(byte[] data, String name) throws Exception {
            File dir = new File(getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no space");
            File f = new File(dir, safe(name));
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
            return FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
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
