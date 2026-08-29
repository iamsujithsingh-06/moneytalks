package com.moneytalks.sms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.time.Instant

/**
 * Native Android SMS capture plugin for the MoneyTalks PWA.
 *
 * Per ADR-005 the *native* layer owns SMS capture; the WebView never reads the
 * inbox. This plugin listens for the `SMS_RECEIVED_ACTION` broadcast (only
 * after the user grants `RECEIVE_SMS` via an in-app disclosure) and pushes each
 * message to the JS side as a `"message"` event: `{ sender, body, receivedAt }`.
 *
 * The JS boundary (`SmsCaptureSource` / `capacitor-source.ts`) maps these onto
 * the shared parse/ingest pipeline. No raw message is ever sent to the server.
 *
 * JS contract:
 * - `SmsCapture.getPermission()`            -> `{ state }` ("granted"|"prompt")
 * - `SmsCapture.requestPermission()`        -> `{ state }` ("granted"|"denied")
 * - `SmsCapture.startCapture()`             -> starts the receiver (no-op if revoked)
 * - `SmsCapture.stopCapture()`              -> unregisters the receiver
 * - `SmsCapture.addListener("message", fn)` -> push events (Capacitor addListener)
 */
@CapacitorPlugin(
    name = "SmsCapture",
    permissions = [
        Permission(strings = [Manifest.permission.RECEIVE_SMS], alias = "sms"),
    ],
)
class SmsCapturePlugin : Plugin() {

    /** Held call (setKeepAlive) through which broadcasts reach JS listeners. */
    private var retainedCall: PluginCall? = null

    private val receiver = object : BroadcastReceiver() {
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
                put("receivedAt", Instant.now().toString())
            }
            // Prefer notifyListeners so the JS-side addListener("message") fires;
            // fall back to a window event if no retained call is active.
            retainedCall?.notifyListeners("message", data)
                ?: bridge?.triggerWindowJSEvent("message", data)
        }
    }

    @PluginMethod
    fun getPermission(call: PluginCall) {
        val granted = isPermissionGranted()
        call.resolve(JSObject().put("state", if (granted) "granted" else "prompt"))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (isPermissionGranted()) {
            call.resolve(JSObject().put("state", "granted"))
            return
        }
        requestPermissionForAlias("sms", call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (isPermissionGranted()) {
            call.resolve(JSObject().put("state", "granted"))
        } else {
            call.resolve(JSObject().put("state", "denied"))
        }
    }

    @PluginMethod
    fun startCapture(call: PluginCall) {
        call.setKeepAlive(true)
        retainedCall = call
        val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(receiver, filter)
        }
        call.resolve()
    }

    @PluginMethod
    fun stopCapture(call: PluginCall) {
        try {
            context.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
            // Already unregistered.
        }
        retainedCall = null
        call.resolve()
    }

    private fun isPermissionGranted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED
}
