# MoneyTalks Android R8/ProGuard rules.
#
# The Capacitor library ships its own rules (kept automatically from the
# :capacitor-android AAR). Add app-specific keeps below.

# The SMS capture receiver and plugin are referenced from the manifest and by
# Capacitor's runtime reflection, so R8 must not strip or rename them.
-keep class com.moneytalks.sms.SmsCaptureReceiver { *; }
-keep class com.moneytalks.sms.SmsCapturePlugin { *; }

# The Capacitor Preferences native plugin.
-keep class com.getcapacitor.community.preferences.* { *; }

# Preserve source file name only for actionable stack traces in crash reports.
-keepattributes SourceFile,LineNumberTable
