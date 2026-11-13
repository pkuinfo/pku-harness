package expo.modules.appupdater

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** DownloadManager's "finished" broadcast, sent to this app even when it isn't running. */
class DownloadDoneReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
    val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
    if (id >= 0) UpdateDownloads.finished(context, id)
  }
}
