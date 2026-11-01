package com.alphonso.companion;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlphonsoPhonePlugin.class);
        super.onCreate(savedInstanceState);
        PushService.ensureChannel(this);
        AlphonsoPhonePlugin.handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        AlphonsoPhonePlugin.handleIntent(intent);
    }
}
