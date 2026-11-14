package com.mausos.icon

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Switches the app's home-screen icon between MauSOS and a calculator.
 *
 * The app manifest declares two launcher entries (activity aliases), both
 * opening the same MainActivity: `.LauncherDefault` with the MauSOS icon and
 * name, and `.LauncherCalculator` with a calculator icon and the name
 * "Calculator". Exactly one is enabled at a time; the launcher shows only
 * enabled entries. Enabling the new one before disabling the old means there
 * is never a moment with no icon at all.
 *
 * DONT_KILL_APP keeps the app running while its own icon changes. Launchers
 * can take a few seconds to redraw, and some remove a home-screen shortcut to
 * the old entry; the app drawer always shows the current one.
 */
class MausosIconModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun component(alias: String) = ComponentName(context.packageName, "${context.packageName}.$alias")

  private fun exists(alias: String): Boolean = try {
    context.packageManager.getActivityInfo(component(alias), PackageManager.MATCH_DISABLED_COMPONENTS)
    true
  } catch (e: PackageManager.NameNotFoundException) {
    false
  }

  private fun isEnabled(alias: String): Boolean {
    val pm = context.packageManager
    return when (pm.getComponentEnabledSetting(component(alias))) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ->
        pm.getActivityInfo(component(alias), PackageManager.MATCH_DISABLED_COMPONENTS).enabled
      else -> false
    }
  }

  private fun set(alias: String, enabled: Boolean) {
    context.packageManager.setComponentEnabledSetting(
      component(alias),
      if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
      PackageManager.DONT_KILL_APP
    )
  }

  override fun definition() = ModuleDefinition {
    Name("MausosIcon")

    /** False if this build's manifest lacks the aliases (plugin not applied). */
    Function("isSupported") {
      exists(DEFAULT) && exists(CALCULATOR)
    }

    Function("isDisguised") {
      exists(CALCULATOR) && isEnabled(CALCULATOR)
    }

    Function("setDisguised") { disguised: Boolean ->
      if (!(exists(DEFAULT) && exists(CALCULATOR))) return@Function false
      val show = if (disguised) CALCULATOR else DEFAULT
      val hide = if (disguised) DEFAULT else CALCULATOR
      if (!isEnabled(show)) set(show, true)
      if (isEnabled(hide)) set(hide, false)
      true
    }
  }

  companion object {
    private const val DEFAULT = "LauncherDefault"
    private const val CALCULATOR = "LauncherCalculator"
  }
}
