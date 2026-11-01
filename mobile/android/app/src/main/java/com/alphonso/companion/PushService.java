package com.alphonso.companion;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import com.goterl.lazysodium.SodiumAndroid;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Opens a notice the computer sealed for this phone (src/services/phone/phoneLink.ts's
 * pushNotice: crypto_box, nonce first, base64url) and shows its real text. Google and the
 * relay only see the sealed bytes. Approve / Reject open the app, which answers the computer;
 * a step that spends, sends or publishes, or deletes comes with only Open.
 */
public class PushService extends FirebaseMessagingService {
    static final String CHANNEL = "waiting";

    static void ensureChannel(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Waiting for you", NotificationManager.IMPORTANCE_HIGH));
    }

    private static byte[] b64url(String s) {
        return Base64.decode(s, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    /** The notice inside a sealed message, or null when it doesn't open with this phone's keys. */
    static JSONObject open(Context context, String sealed) {
        try {
            String mine = PhoneSecrets.get(context, PhoneSecrets.PRIVATE_KEY_NAME);
            String theirs = PhoneSecrets.get(context, PhoneSecrets.COMPUTER_KEY_NAME);
            if (mine == null || theirs == null || sealed == null) return null;
            byte[] raw = b64url(sealed);
            if (raw.length < 24 + 16) return null;
            byte[] nonce = Arrays.copyOfRange(raw, 0, 24);
            byte[] box = Arrays.copyOfRange(raw, 24, raw.length);
            byte[] out = new byte[box.length - 16];
            if (new SodiumAndroid().crypto_box_open_easy(out, box, box.length, nonce, b64url(theirs), b64url(mine)) != 0) return null;
            JSONObject message = new JSONObject(new String(out, StandardCharsets.UTF_8));
            return "notice".equals(message.optString("kind")) ? message.optJSONObject("notification") : null;
        } catch (Exception e) {
            return null;
        }
    }

    private PendingIntent openApp(String action, String requestId, String stepId, int code) {
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(AlphonsoPhonePlugin.EXTRA_ACTION, action)
            .putExtra(AlphonsoPhonePlugin.EXTRA_REQUEST, requestId)
            .putExtra(AlphonsoPhonePlugin.EXTRA_STEP, stepId == null ? "" : stepId);
        return PendingIntent.getActivity(this, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        JSONObject notice = open(this, message.getData().get("sealed"));
        ensureChannel(this);
        NotificationCompat.Builder n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);
        if (notice == null) {
            n.setContentTitle("Alphonso").setContentText("New activity");
        } else {
            String requestId = notice.optString("requestId");
            String stepId = notice.optString("stepId", "");
            int id = notice.optString("key", requestId).hashCode();
            n.setContentTitle(notice.optString("title", "Alphonso")).setContentText(notice.optString("body", ""))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(notice.optString("body", "")))
                .setContentIntent(openApp("open", requestId, stepId, id));
            // A small still of the work ("ready to check"), when the computer could fit one.
            String still = notice.optString("still", "");
            if (!still.isEmpty()) {
                try {
                    byte[] jpeg = Base64.decode(still, Base64.DEFAULT);
                    Bitmap picture = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
                    if (picture != null) {
                        n.setLargeIcon(picture).setStyle(new NotificationCompat.BigPictureStyle()
                            .bigPicture(picture).setSummaryText(notice.optString("body", "")));
                    }
                } catch (IllegalArgumentException e) {
                    // Not a picture: the notice shows as text.
                }
            }
            JSONArray actions = notice.optJSONArray("actions");
            for (int i = 0; actions != null && i < actions.length(); i++) {
                String a = actions.optString(i);
                if ("approve".equals(a)) n.addAction(0, "Approve", openApp("approve", requestId, stepId, id + 1));
                else if ("reject".equals(a)) n.addAction(0, "Reject", openApp("reject", requestId, stepId, id + 2));
                else if ("open".equals(a)) n.addAction(0, "Open", openApp("open", requestId, stepId, id + 3));
            }
            getSystemService(NotificationManager.class).notify(id, n.build());
            return;
        }
        getSystemService(NotificationManager.class).notify(0, n.build());
    }
}
