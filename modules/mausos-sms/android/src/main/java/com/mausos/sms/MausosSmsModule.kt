package com.mausos.sms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sends SMS directly through Android's telephony stack, with no user
 * interaction and no SMS application opened.
 *
 * Why this exists: React Native has no access to the phone's radio, and
 * expo-sms can only open the system SMS composer, which requires the user to
 * press send. For an emergency application that is the wrong behaviour — the
 * user may be unable to look at the screen, or may be being watched. Android
 * permits a third-party application to send SMS directly given the SEND_SMS
 * permission; iOS provides no equivalent at all, which is why this module is
 * Android-only.
 *
 * Device compatibility: on some manufacturers' builds of Android 12 and later
 * (observed on Samsung), the SmsManager returned by
 * getSystemService(SmsManager::class.java) attributes the send to the system
 * phone process rather than to this application, and the platform rejects it
 * with "Package com.android.phone does not match provided uid". The older,
 * subscription-bound accessors do not have this defect. The module therefore
 * tries several ways of obtaining an SmsManager, in order, and uses the first
 * that the platform accepts. The strategy that succeeded is returned to
 * JavaScript so it can be logged and reported.
 *
 * The module reports whether each message actually left the device rather than
 * merely whether Android accepted the request. SmsManager.sendTextMessage
 * returns immediately and silently, so without the PendingIntent callback below
 * a failed send would be indistinguishable from a successful one.
 */
class MausosSmsModule : Module() {

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: appContext.reactContext
      ?: throw Exceptions.ReactContextLost()

  // Guards against a message being queued but never reported, which would
  // otherwise leave the JavaScript promise pending forever.
  private val sendTimeoutMs = 20000L

  override fun definition() = ModuleDefinition {
    Name("MausosSms")

    /** Whether SEND_SMS has been granted. The request itself is made from
     *  JavaScript using React Native's PermissionsAndroid. */
    Function("hasPermission") {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.SEND_SMS
      ) == PackageManager.PERMISSION_GRANTED
    }

    /** Whether this device has telephony hardware at all. A tablet without a
     *  modem reports false, and the alert should fall back rather than fail. */
    Function("isSmsCapable") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    /** How many parts a message will be split into. Each part is billed
     *  separately, so the alert text is kept as short as it usefully can be. */
    Function("countParts") { message: String ->
      try {
        val manager = candidateSmsManagers().firstOrNull()?.second
        manager?.divideMessage(message)?.size ?: 1
      } catch (e: Exception) {
        1
      }
    }

    AsyncFunction("sendSms") { phoneNumber: String, message: String, promise: Promise ->
      sendSms(phoneNumber, message, promise)
    }
  }

  /**
   * Every available way of obtaining an SmsManager, most reliable first, each
   * paired with a label recorded when it is the one that succeeds.
   */
  private fun candidateSmsManagers(): List<Pair<String, SmsManager>> {
    val candidates = mutableListOf<Pair<String, SmsManager>>()

    val subId = try {
      SubscriptionManager.getDefaultSmsSubscriptionId()
    } catch (e: Exception) {
      SubscriptionManager.INVALID_SUBSCRIPTION_ID
    }
    val hasSub = subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID

    // 1. Bound explicitly to the default SMS SIM. Deprecated in API 31 but the
    //    most dependable across manufacturers, and correct on dual-SIM phones.
    if (hasSub) {
      try {
        @Suppress("DEPRECATION")
        candidates.add("subscription" to SmsManager.getSmsManagerForSubscriptionId(subId))
      } catch (ignored: Exception) {}
    }

    // 2. The legacy default accessor.
    try {
      @Suppress("DEPRECATION")
      candidates.add("default" to SmsManager.getDefault())
    } catch (ignored: Exception) {}

    // 3. and 4. The API 31+ system-service route recommended by Google, which
    //    is the one some vendor builds mis-attribute. Kept as a last resort so
    //    devices without the defect still have a path.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val base = context.getSystemService(SmsManager::class.java)
        if (base != null) {
          if (hasSub) {
            try {
              candidates.add("system-service-sub" to base.createForSubscriptionId(subId))
            } catch (ignored: Exception) {}
          }
          candidates.add("system-service" to base)
        }
      } catch (ignored: Exception) {}
    }

    return candidates
  }

  private fun sendSms(phoneNumber: String, message: String, promise: Promise) {
    if (ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.SEND_SMS
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("E_PERMISSION_DENIED", "SEND_SMS permission has not been granted.", null)
      return
    }

    if (phoneNumber.isBlank()) {
      promise.reject("E_INVALID_NUMBER", "No phone number was supplied.", null)
      return
    }

    val candidates = candidateSmsManagers()
    if (candidates.isEmpty()) {
      promise.reject("E_NO_SMS_MANAGER", "This device exposes no way to send SMS.", null)
      return
    }

    val parts = candidates.first().second.divideMessage(message)
    val totalParts = parts.size

    // A unique action per send, so concurrent sends to several contacts do not
    // receive each other's results.
    val action = "com.mausos.sms.SENT.${System.nanoTime()}"

    val settled = AtomicBoolean(false)
    val reported = AtomicInteger(0)
    val failureCode = arrayOfNulls<String>(1)
    val usedStrategy = arrayOfNulls<String>(1)

    val handler = Handler(Looper.getMainLooper())
    var timeoutRunnable: Runnable? = null

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (settled.get()) return

        if (resultCode != Activity.RESULT_OK && failureCode[0] == null) {
          failureCode[0] = describeFailure(resultCode)
        }

        if (reported.incrementAndGet() >= totalParts) {
          if (settled.compareAndSet(false, true)) {
            timeoutRunnable?.let { handler.removeCallbacks(it) }
            safeUnregister(this)

            val failure = failureCode[0]
            if (failure == null) {
              promise.resolve(
                mapOf(
                  "sent" to true,
                  "parts" to totalParts,
                  "strategy" to (usedStrategy[0] ?: "unknown")
                )
              )
            } else {
              promise.reject("E_SEND_FAILED", failure, null)
            }
          }
        }
      }
    }

    // Android 13 requires every runtime-registered receiver to declare whether
    // other applications may reach it. This one is strictly internal.
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, IntentFilter(action), Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(receiver, IntentFilter(action))
      }
    } catch (e: Exception) {
      promise.reject("E_RECEIVER", "Could not listen for the send result: ${e.message}", e)
      return
    }

    timeoutRunnable = Runnable {
      if (settled.compareAndSet(false, true)) {
        safeUnregister(receiver)
        promise.reject(
          "E_TIMEOUT",
          "The network did not confirm the message within ${sendTimeoutMs / 1000} seconds.",
          null
        )
      }
    }
    handler.postDelayed(timeoutRunnable!!, sendTimeoutMs)

    // FLAG_IMMUTABLE is mandatory from API 31 and is correct here regardless:
    // nothing outside this module should be able to alter the intent.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }

    val sentIntents = ArrayList<PendingIntent>(totalParts)
    for (i in 0 until totalParts) {
      sentIntents.add(
        PendingIntent.getBroadcast(
          context,
          i,
          Intent(action).setPackage(context.packageName),
          flags
        )
      )
    }

    // Try each SmsManager in turn. A SecurityException means the platform
    // rejected that accessor's attribution, so the next one is tried. Any other
    // exception is a genuine failure and is reported immediately.
    val rejections = mutableListOf<String>()
    var accepted = false

    for ((label, manager) in candidates) {
      try {
        if (totalParts > 1) {
          manager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null)
        } else {
          manager.sendTextMessage(phoneNumber, null, message, sentIntents[0], null)
        }
        usedStrategy[0] = label
        accepted = true
        break
      } catch (e: SecurityException) {
        rejections.add("$label: ${e.message}")
      } catch (e: Exception) {
        rejections.add("$label: ${e.message}")
        break
      }
    }

    if (!accepted && settled.compareAndSet(false, true)) {
      timeoutRunnable?.let { handler.removeCallbacks(it) }
      safeUnregister(receiver)
      promise.reject(
        "E_SEND_THREW",
        "Android refused the message by every available route. " + rejections.joinToString(" | "),
        null
      )
    }
  }

  private fun safeUnregister(receiver: BroadcastReceiver) {
    try {
      context.unregisterReceiver(receiver)
    } catch (ignored: Exception) {
      // Already unregistered, or the context is gone. Nothing to do.
    }
  }

  private fun describeFailure(code: Int): String = when (code) {
    SmsManager.RESULT_ERROR_NO_SERVICE ->
      "No mobile network service. Check signal and try again."
    SmsManager.RESULT_ERROR_RADIO_OFF ->
      "The phone radio is off. Turn off aeroplane mode and try again."
    SmsManager.RESULT_ERROR_NULL_PDU ->
      "The message could not be encoded."
    SmsManager.RESULT_ERROR_GENERIC_FAILURE ->
      "The network rejected the message. Check that the SIM has credit."
    else ->
      "The message failed to send (code $code)."
  }
}
