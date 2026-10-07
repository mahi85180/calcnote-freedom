package com.mahi85180.calcnotefreedom;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(KhataSenderPlugin.class);
        registerPlugin(BackupFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
