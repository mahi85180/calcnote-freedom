package com.mahi85180.calcnotefreedom;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.telephony.SmsManager;
import android.telephony.SubscriptionManager;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Khata book messages:
 *  - sendSms: sends an SMS straight from the phone's SIM (asks for the SMS permission once)
 *  - whatsapp: opens WhatsApp / WhatsApp Business on the party's chat with the message typed in
 *  - pickContact: lets the user pick a name + number from the phone book (no contacts permission needed)
 */
@CapacitorPlugin(
    name = "KhataSender",
    permissions = { @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms") }
)
public class KhataSenderPlugin extends Plugin {
    private static final String WA = "com.whatsapp";
    private static final String WA_BIZ = "com.whatsapp.w4b";
    private static int counter = 0;

    private boolean installed(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void apps(PluginCall call) {
        JSObject r = new JSObject();
        r.put("wa", installed(WA));
        r.put("biz", installed(WA_BIZ));
        r.put("sms", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY));
        r.put("smsPermission", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestSms(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionDone");
    }

    @PermissionCallback
    private void smsPermissionDone(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** The SIM chosen for SMS in the phone settings (dual-SIM phones), else the default SIM. */
    @SuppressWarnings("deprecation")
    private SmsManager smsManager() {
        int sub = SubscriptionManager.INVALID_SUBSCRIPTION_ID;
        try {
            sub = SubscriptionManager.getDefaultSmsSubscriptionId();
            if (sub == SubscriptionManager.INVALID_SUBSCRIPTION_ID) sub = SubscriptionManager.getDefaultSubscriptionId();
        } catch (Exception ignored) { }
        if (Build.VERSION.SDK_INT >= 31) {
            SmsManager m = getContext().getSystemService(SmsManager.class);
            if (m != null) return sub != SubscriptionManager.INVALID_SUBSCRIPTION_ID ? m.createForSubscriptionId(sub) : m;
        }
        if (sub != SubscriptionManager.INVALID_SUBSCRIPTION_ID) return SmsManager.getSmsManagerForSubscriptionId(sub);
        return SmsManager.getDefault();
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        final String phone = call.getString("phone", "");
        final String text = call.getString("text", "");
        if (phone == null || phone.replaceAll("[^0-9]", "").length() < 6) { call.reject("Phone number missing"); return; }
        if (text == null || text.isEmpty()) { call.reject("Message is empty"); return; }
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("SMS permission not given", "NO_PERMISSION"); return; }

        final Context ctx = getContext();
        final SmsManager sms;
        final ArrayList<String> parts;
        try {
            sms = smsManager();
            parts = sms.divideMessage(text);
        } catch (Exception e) {
            call.reject("SMS not available: " + e.getMessage());
            return;
        }
        final String action = ctx.getPackageName() + ".KHATA_SMS_SENT." + (++counter) + "." + System.currentTimeMillis();
        final AtomicInteger left = new AtomicInteger(parts.size());
        final AtomicBoolean done = new AtomicBoolean(false);
        final AtomicBoolean failed = new AtomicBoolean(false);
        final Handler handler = new Handler(Looper.getMainLooper());
        final BroadcastReceiver[] holder = new BroadcastReceiver[1];

        final Runnable finish = () -> {
            if (!done.compareAndSet(false, true)) return;
            try { ctx.unregisterReceiver(holder[0]); } catch (Exception ignored) { }
            JSObject r = new JSObject();
            r.put("ok", !failed.get());
            r.put("status", failed.get() ? "failed" : (left.get() <= 0 ? "sent" : "pending"));
            r.put("parts", parts.size());
            call.resolve(r);
        };
        holder[0] = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (getResultCode() != Activity.RESULT_OK) failed.set(true);
                if (left.decrementAndGet() <= 0 || failed.get()) handler.post(finish);
            }
        };
        ContextCompat.registerReceiver(ctx, holder[0], new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);

        try {
            int flags = PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int i = 0; i < parts.size(); i++) {
                Intent it = new Intent(action).setPackage(ctx.getPackageName());
                sent.add(PendingIntent.getBroadcast(ctx, (counter * 100 + i) & 0x7fffffff, it, flags));
            }
            String to = phone.replaceAll("[^0-9+]", "");
            if (parts.size() > 1) sms.sendMultipartTextMessage(to, null, parts, sent, null);
            else sms.sendTextMessage(to, null, text, sent.get(0), null);
        } catch (Exception e) {
            done.set(true);
            try { ctx.unregisterReceiver(holder[0]); } catch (Exception ignored) { }
            call.reject("Could not send SMS: " + e.getMessage());
            return;
        }
        // the phone network can take a while – answer anyway after 25 s (message is queued by Android)
        handler.postDelayed(finish, 25000);
    }

    @PluginMethod
    public void whatsapp(PluginCall call) {
        String phone = call.getString("phone", "");
        String text = call.getString("text", "");
        String pkg = call.getString("pkg", "");
        if (phone == null) phone = "";
        phone = phone.replaceAll("[^0-9]", "");
        if (pkg == null || pkg.isEmpty()) pkg = installed(WA) ? WA : (installed(WA_BIZ) ? WA_BIZ : "");
        try {
            if (!pkg.isEmpty() && installed(pkg)) {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.setPackage(pkg);
                i.putExtra(Intent.EXTRA_TEXT, text);
                if (!phone.isEmpty()) i.putExtra("jid", phone + "@s.whatsapp.net");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } else {
                Uri u = Uri.parse("https://wa.me/" + phone + "?text=" + Uri.encode(text));
                Intent v = new Intent(Intent.ACTION_VIEW, u);
                v.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(v);
            }
            JSObject r = new JSObject();
            r.put("opened", true);
            r.put("pkg", pkg);
            call.resolve(r);
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp is not installed", "NO_WHATSAPP");
        } catch (Exception e) {
            call.reject("Could not open WhatsApp: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(call, i, "contactPicked");
        } catch (Exception e) {
            call.reject("Contacts app not available");
        }
    }

    @ActivityCallback
    private void contactPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri uri = result.getData().getData();
        String[] cols = { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
        try (Cursor c = getContext().getContentResolver().query(uri, cols, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                r.put("name", c.getString(0));
                r.put("phone", c.getString(1));
            } else r.put("cancelled", true);
        } catch (Exception e) {
            r.put("cancelled", true);
        }
        call.resolve(r);
    }
}
