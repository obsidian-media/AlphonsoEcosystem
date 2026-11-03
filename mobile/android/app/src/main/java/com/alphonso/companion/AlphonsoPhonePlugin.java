package com.alphonso.companion;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.ArrayList;
import java.util.List;

/**
 * The phone app's own native parts for the shared screens (mobile/src/native.ts): secure
 * storage, fingerprint / face / screen lock, notification permission and the Firebase push
 * token, and the buttons on Alphonso's notifications (PushService), which open the app.
 */
@CapacitorPlugin(name = "AlphonsoPhone", permissions = @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications"))
public class AlphonsoPhonePlugin extends Plugin {
    static final String EXTRA_ACTION = "alphonso_action";
    static final String EXTRA_REQUEST = "alphonso_request";
    static final String EXTRA_STEP = "alphonso_step";

    private static final List<JSObject> pending = new ArrayList<>();
    private static AlphonsoPhonePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** A notification's button or tap, from MainActivity. */
    static void handleIntent(Intent intent) {
        if (intent == null || intent.getStringExtra(EXTRA_REQUEST) == null) return;
        JSObject action = new JSObject();
        String id = intent.getStringExtra(EXTRA_ACTION);
        action.put("action", "approve".equals(id) || "reject".equals(id) ? id : "open");
        action.put("requestId", intent.getStringExtra(EXTRA_REQUEST));
        String step = intent.getStringExtra(EXTRA_STEP);
        if (step != null && !step.isEmpty()) action.put("stepId", step);
        intent.removeExtra(EXTRA_REQUEST);
        synchronized (pending) {
            if (instance != null && instance.hasListeners("notificationAction")) instance.notifyListeners("notificationAction", action);
            else pending.add(action);
        }
    }

    @PluginMethod
    public void getSecret(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("No key."); return; }
        JSObject out = new JSObject();
        String value = PhoneSecrets.get(getContext(), key);
        out.put("value", value == null ? JSObject.NULL : value);
        call.resolve(out);
    }

    @PluginMethod
    public void setSecret(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("No key."); return; }
        if (PhoneSecrets.set(getContext(), key, value)) call.resolve(); else call.reject("The phone's secure storage refused it.");
    }

    private static int authenticators() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL
            : BiometricManager.Authenticators.BIOMETRIC_WEAK;
    }

    /**
     * Fingerprint / face, else the screen lock. A phone with no screen lock may open the app,
     * but a strict confirmation (approving a step that spends, sends or deletes) is refused.
     */
    @PluginMethod
    public void confirm(PluginCall call) {
        String reason = call.getString("reason", "Confirm");
        boolean strict = Boolean.TRUE.equals(call.getBoolean("strict", false));
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        boolean secure = keyguard != null && keyguard.isDeviceSecure();
        JSObject out = new JSObject();
        if (!secure) { out.put("ok", !strict); call.resolve(out); return; }
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder().setTitle("Alphonso").setSubtitle(reason);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) info.setAllowedAuthenticators(authenticators());
            else info.setDeviceCredentialAllowed(true);
            new BiometricPrompt(activity, ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); }
                @Override public void onAuthenticationError(int code, CharSequence text) { JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); }
            }).authenticate(info.build());
        });
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call);
        } else {
            requestPermissionForAlias("notifications", call, "notificationsAnswered");
        }
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(out);
    }

    @PluginMethod
    public void pushToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                JSObject out = new JSObject();
                out.put("token", task.isSuccessful() && task.getResult() != null ? task.getResult() : JSObject.NULL);
                call.resolve(out);
            });
        } catch (IllegalStateException e) {
            // A build without google-services.json has no Firebase.
            JSObject out = new JSObject();
            out.put("token", JSObject.NULL);
            call.resolve(out);
        }
    }

    @PluginMethod
    public void takePendingActions(PluginCall call) {
        JSArray actions = new JSArray();
        synchronized (pending) {
            for (JSObject a : pending) actions.put(a);
            pending.clear();
        }
        JSObject out = new JSObject();
        out.put("actions", actions);
        call.resolve(out);
    }
}
