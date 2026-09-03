import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moneytalks.app',
  appName: 'MoneyTalks',
  webDir: 'dist',
  server: {
    // Serve the app in the Android WebView over HTTPS and block cleartext
    // traffic. Android's default `https` schema keeps all WebView traffic
    // encrypted; `cleartext: false` plus the network security config in
    // AndroidManifest prevents any plain-HTTP request from reaching the network.
    androidScheme: 'https',
    cleartext: false,
  }
};

export default config;
