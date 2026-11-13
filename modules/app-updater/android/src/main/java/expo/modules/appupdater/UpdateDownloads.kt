package expo.modules.appupdater

import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import java.io.File

/**
 * The release APK download, kept in DownloadManager so it runs in the background with the
 * system's progress notification. One download at a time; its id and version are remembered so
 * the state survives the app being closed.
 */
internal object UpdateDownloads {
  private const val PREFS = "app_updater"
  private const val CHANNEL = "app_updates"
  private const val READY_ID = 7301
  private const val APK = "application/vnd.android.package-archive"

  /** Set by the module while it is loaded, so a finished download reaches JS at once. */
  @Volatile var onChange: ((Map<String, Any?>) -> Unit)? = null

  private fun prefs(c: Context) = c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun manager(c: Context) = c.getSystemService(DownloadManager::class.java)

  private fun fileName(version: String) = "pku-harness-$version.apk"

  fun enqueue(c: Context, url: String, version: String, size: Long, title: String, description: String, wifiOnly: Boolean, ready: ReadyText): Map<String, Any?> {
    val current = state(c)
    // Already downloading or downloaded this version: keep it (a Wi-Fi-only download that the
    // user now wants at once is restarted without the Wi-Fi limit).
    if (prefs(c).getString("version", null) == version && current["status"] in setOf("running", "pending", "paused", "done")) {
      val waiting = current["waitingForNetwork"] == true
      if (!(waiting && !wifiOnly && prefs(c).getBoolean("wifiOnly", false))) return current
    }
    cancel(c)
    File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName(version)).delete()
    val request = DownloadManager.Request(Uri.parse(url))
      .setTitle(title)
      .setDescription(description)
      .setMimeType(APK)
      // Progress in the system notification while it runs; the app posts "Tap to install" itself.
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
      .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, fileName(version))
      .setAllowedOverMetered(!wifiOnly)
      .setAllowedOverRoaming(!wifiOnly)
    val id = manager(c).enqueue(request)
    prefs(c).edit().putLong("id", id).putString("version", version).putLong("size", size).putBoolean("wifiOnly", wifiOnly)
      .putString("readyTitle", ready.title).putString("readyText", ready.text).putString("channelName", ready.channel).apply()
    return state(c)
  }

  data class ReadyText(val title: String, val text: String, val channel: String)

  fun state(c: Context): Map<String, Any?> {
    val p = prefs(c)
    val id = p.getLong("id", -1)
    val version = p.getString("version", null)
    if (id < 0 || version == null) return mapOf("status" to "none")
    manager(c).query(DownloadManager.Query().setFilterById(id)).use { cur ->
      if (!cur.moveToFirst()) return mapOf("status" to "none")
      val status = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      val written = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
      val total = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).takeIf { it > 0 } ?: p.getLong("size", 0)
      val reason = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
      return when (status) {
        DownloadManager.STATUS_SUCCESSFUL -> {
          val expected = p.getLong("size", 0)
          if (expected > 0 && written != expected) mapOf("status" to "failed", "version" to version, "reason" to "incomplete download")
          else mapOf("status" to "done", "version" to version, "total" to total.toDouble())
        }
        DownloadManager.STATUS_FAILED -> mapOf("status" to "failed", "version" to version, "reason" to "download error $reason")
        else -> mapOf(
          "status" to when (status) { DownloadManager.STATUS_PENDING -> "pending"; DownloadManager.STATUS_PAUSED -> "paused"; else -> "running" },
          "version" to version, "written" to written.toDouble(), "total" to total.toDouble(),
          "waitingForNetwork" to (status == DownloadManager.STATUS_PAUSED &&
            reason in setOf(DownloadManager.PAUSED_QUEUED_FOR_WIFI, DownloadManager.PAUSED_WAITING_FOR_NETWORK)),
        )
      }
    }
  }

  fun cancel(c: Context) {
    val id = prefs(c).getLong("id", -1)
    if (id >= 0) manager(c).remove(id)
    prefs(c).edit().clear().apply()
    c.getSystemService(NotificationManager::class.java).cancel(READY_ID)
  }

  /** The installer for the finished download (Android checks the signature matches this app). */
  fun installIntent(c: Context): Intent? {
    if (state(c)["status"] != "done") return null
    val uri = manager(c).getUriForDownloadedFile(prefs(c).getLong("id", -1)) ?: return null
    return Intent(Intent.ACTION_VIEW).setDataAndType(uri, APK)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
  }

  /** Download finished: tell JS, and post "Tap to install" (or nothing when it failed). */
  fun finished(c: Context, id: Long) {
    if (id != prefs(c).getLong("id", -1)) return
    val s = state(c)
    onChange?.invoke(s)
    if (s["status"] != "done") return
    val intent = installIntent(c) ?: return
    val nm = c.getSystemService(NotificationManager::class.java)
    val p = prefs(c)
    nm.createNotificationChannel(NotificationChannel(CHANNEL, p.getString("channelName", "App updates"), NotificationManager.IMPORTANCE_DEFAULT))
    if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val tap = PendingIntent.getActivity(c, READY_ID, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = c.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_sys_download_done
    nm.notify(READY_ID, android.app.Notification.Builder(c, CHANNEL)
      .setSmallIcon(notificationIcon(c) ?: icon)
      .setContentTitle(p.getString("readyTitle", "Update downloaded"))
      .setContentText(p.getString("readyText", "Tap to install"))
      .setContentIntent(tap)
      .setAutoCancel(true)
      .build())
  }

  /** The app's monochrome notification icon (expo-notifications' resource), when present. */
  private fun notificationIcon(c: Context): Int? =
    c.resources.getIdentifier("notification_icon", "drawable", c.packageName).takeIf { it != 0 }

  /** Forget a download whose version is installed now (or older). */
  fun clean(c: Context, installed: String) {
    val version = prefs(c).getString("version", null) ?: return
    if (!newer(version, installed)) cancel(c)
  }

  private fun newer(a: String, b: String): Boolean {
    val x = a.split('.').map { it.toIntOrNull() ?: 0 }
    val y = b.split('.').map { it.toIntOrNull() ?: 0 }
    for (i in 0 until maxOf(x.size, y.size)) {
      val d = (x.getOrElse(i) { 0 }) - (y.getOrElse(i) { 0 })
      if (d != 0) return d > 0
    }
    return false
  }
}
