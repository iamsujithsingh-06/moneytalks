package com.moneytalks.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.getcapacitor.JSObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Manifest-declared receiver for incoming transaction SMS (ADR-005).
 *
 * Registered in the app's merged manifest for `SMS_RECEIVED_ACTION`, so the OS
 * hands bank/UPI broadcasts to this app without requiring an active WebView
 * process. Parses the raw message exactly as the old inline receiver did and
 * forwards a `{ sender, body, receivedAt }` payload to the plugin's
 * `notifyListeners` JS pipeline. If the bridge is not loaded the message is
 * queued natively and replayed on the next app open, so background reception
 * never loses a transaction. No raw body ever leaves the device.
 */
class SmsCaptureReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return

        val body = messages
            .mapNotNull { it.displayMessageBody }
            .joinToString("\n")
            .trim()
        if (body.isEmpty()) return

        val sender = messages.firstOrNull()?.originatingAddress
        val data = JSObject().apply {
            put("sender", sender)
            put("body", body)
            put("receivedAt", receivedAtIso(messages.firstOrNull()?.timestampMillis))
        }
        if (!SmsCapturePlugin.dispatchSms(data)) {
            SmsCapturePlugin.enqueueSms(context.applicationContext, data)
        }
    }

    /**
     * ISO-8601 UTC timestamp of the actual SMS event. Prefers the timestamp
     * Android recorded for the message (when the SMS was sent/received). Only
     * falls back to the current time when that timestamp is genuinely
     * unavailable. Avoids java.time for minSdk 24 (no desugaring).
     */
    private fun receivedAtIso(androidTimestampMillis: Long?): String {
        val millis = androidTimestampMillis ?: 0L
        val date = if (millis > 0L) Date(millis) else Date()
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(date)
    }
}