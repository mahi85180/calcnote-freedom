package com.mahi85180.calcnotefreedom;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Backup to Google Drive (or any cloud / folder) through Android's own "Save to" screen.
 * The user picks the place once (e.g. Google Drive → My Drive); the app keeps the permission
 * and rewrites that one file every day. No Google login inside the app is needed –
 * the Google Drive app on the phone uploads it.
 */
@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {
    private static final int RW = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** "Save to" screen → returns the chosen file (kept writable for the future). */
    @PluginMethod
    public void create(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "CalcNote-Freedom-Backup.json"));
            i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(call, i, "created");
        } catch (Exception e) {
            call.reject("No file picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void created(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, RW);
        } catch (Exception ignored) { /* some places do not keep permissions – write() will tell */ }
        JSObject r = describe(uri);
        r.put("uri", uri.toString());
        call.resolve(r);
    }

    /** Writes (replaces) the whole file. */
    @PluginMethod
    public void write(PluginCall call) {
        String u = call.getString("uri", "");
        String data = call.getString("data", "");
        if (u == null || u.isEmpty()) { call.reject("No file", "NO_FILE"); return; }
        Uri uri = Uri.parse(u);
        ContentResolver cr = getContext().getContentResolver();
        byte[] bytes = (data == null ? "" : data).getBytes(StandardCharsets.UTF_8);
        Exception last = null;
        for (String mode : new String[] { "wt", "rwt", "w" }) {
            try (OutputStream os = cr.openOutputStream(uri, mode)) {
                if (os == null) throw new Exception("no stream");
                os.write(bytes);
                os.flush();
                JSObject r = describe(uri);
                r.put("ok", true);
                r.put("bytes", bytes.length);
                call.resolve(r);
                return;
            } catch (SecurityException e) {
                call.reject("Permission lost – choose the backup place again", "LOST");
                return;
            } catch (java.io.FileNotFoundException e) {
                last = e;
                if (!"wt".equals(mode)) break;
            } catch (Exception e) {
                last = e;
            }
        }
        call.reject("Could not write backup: " + (last == null ? "" : last.getMessage()), "WRITE_FAILED");
    }

    /** Is the chosen file still usable? */
    @PluginMethod
    public void check(PluginCall call) {
        String u = call.getString("uri", "");
        boolean kept = false;
        if (u != null && !u.isEmpty()) {
            for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (p.getUri().toString().equals(u) && p.isWritePermission()) { kept = true; break; }
            }
        }
        JSObject r = kept ? describe(Uri.parse(u)) : new JSObject();
        r.put("kept", kept);
        call.resolve(r);
    }

    @PluginMethod
    public void release(PluginCall call) {
        String u = call.getString("uri", "");
        try { if (u != null && !u.isEmpty()) getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(u), RW); } catch (Exception ignored) { }
        call.resolve();
    }

    /** "Open" screen → returns the text of the chosen backup file (for restoring on a new phone). */
    @PluginMethod
    public void open(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "application/octet-stream" });
            startActivityForResult(call, i, "opened");
        } catch (Exception e) {
            call.reject("No file picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri uri = result.getData().getData();
        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) throw new Exception("no stream");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            long total = 0;
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > 60L * 1024 * 1024) { call.reject("File is too large"); return; }
                bo.write(buf, 0, n);
            }
            r = describe(uri);
            r.put("text", new String(bo.toByteArray(), StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read the file: " + e.getMessage());
        }
    }

    private JSObject describe(Uri uri) {
        JSObject r = new JSObject();
        r.put("where", uri.getAuthority() == null ? "" : uri.getAuthority());
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                r.put("name", c.getString(0));
                if (!c.isNull(1)) r.put("size", c.getLong(1));
            }
        } catch (Exception ignored) { }
        return r;
    }
}
