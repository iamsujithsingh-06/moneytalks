package com.moneytalks.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray

/**
 * Native Android SMS capture plugin for the MoneyTalks PWA.
 *
 * Per ADR-005 the *native* layer owns SMS capture; the WebView never reads the
 * inbox. Incoming bank/UPI messages are delivered by the platform to the
 * manifest-declared [SmsCaptureReceiver] (registered for
 * `SMS_RECEIVED_ACTION`) and forwarded here via [dispatchSms], which pushes each
 * message to the JS side as a `"message"` event: `{ sender, body, receivedAt }`.
 *
 * The JS boundary (`SmsCaptureSource` / `capacitor-source.ts`) maps these onto
 * the shared parse/ingest pipeline. No raw message is ever sent to the server.
 *
 * When the JS bridge is not loaded (cold start / WebView not yet up), the
 * receiver persists the raw message via [enqueueSms] instead of dropping it.
 * [startCapture] — which the JS side calls immediately after registering the
 * `"message"` listener — drains that queue through the SAME `notifyListeners`
 * path, so background-received transactions re-enter the existing ingest
 * pipeline (dedup + draft store) and are never lost.
 *
 * JS contract:
 * - `SmsCapture.getPermission()`            -> `{ state }` ("granted"|"prompt")
 * - `SmsCapture.requestPermission()`        -> `{ state }` ("granted"|"denied")
 * - `SmsCapture.startCapture()`             -> flush queued messages; push live (manifest receiver owns delivery)
 * - `SmsCapture.stopCapture()`              -> no-op (manifest receiver owns delivery)
 * - `SmsCapture.addListener("message", fn)` -> push events (Capacitor addListener)
 */
@CapacitorPlugin(
    name = "SmsCapture",
    permissions = [
        Permission(strings = [Manifest.permission.RECEIVE_SMS], alias = "sms"),
    ],
)
class SmsCapturePlugin : Plugin() {

    companion object {
        /** The live plugin instance, set when the bridge loads the plugin. */
        @Volatile
        private var active: SmsCapturePlugin? = null

        private const val PENDING_PREFS = "moneytalks_sms"
        private const val PENDING_KEY = "pending_outbox"
        private const val PENDING_MAX = 100

        /**
         * Entry point used by [SmsCaptureReceiver] to push a raw parsed SMS into
         * the JS pipeline. Returns `false` when the bridge is not loaded so the
         * receiver can persist the message instead of losing it.
         */
        @JvmStatic
        fun dispatchSms(data: JSObject): Boolean {
            val plugin = active ?: return false
            plugin.notifyListeners("message", data)
            return true
        }

        /**
         * Persist a raw SMS captured while the JS bridge was unavailable. The
         * queue is drained transparently on the next [startCapture] through the
         * normal `"message"` event path (bounded to [PENDING_MAX] entries).
         */
        @JvmStatic
        fun enqueueSms(context: Context, data: JSObject) {
            val prefs = context.getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)
            try {
                val existing = prefs.getString(PENDING_KEY, null)
                val queue = if (existing.isNullOrBlank()) JSONArray() else JSONArray(existing)
                if (queue.length() >= PENDING_MAX) queue.remove(0)
                queue.put(data)
                prefs.edit().putString(PENDING_KEY, queue.toString()).apply()
            } catch (_: Exception) {
                // Persistence is best-effort; never crash capture on failure.
            }
        }
    }

    override fun load() {
        active = this
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
        flushPendingSms()
        call.resolve()
    }

    @PluginMethod
    fun stopCapture(call: PluginCall) {
        call.resolve()
    }

    /** Replay messages queued while the JS bridge was unavailable. */
    private fun flushPendingSms() {
        val ctx = context ?: return
        val prefs = ctx.getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(PENDING_KEY, null)
        if (raw.isNullOrBlank()) return
        prefs.edit().remove(PENDING_KEY).apply()
        try {
            val queue = JSONArray(raw)
            for (i in 0 until queue.length()) {
                val item = queue.optJSONObject(i) ?: continue
                notifyListeners("message", JSObject(item.toString()))
            }
        } catch (_: Exception) {
            // Best-effort replay; a malformed entry is dropped, never replayed.
        }
    }

    private fun isPermissionGranted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED
}