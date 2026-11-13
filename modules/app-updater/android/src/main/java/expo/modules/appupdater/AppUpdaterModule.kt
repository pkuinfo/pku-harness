package expo.modules.appupdater

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Release APK downloads through DownloadManager (UpdateDownloads); see src/AppUpdaterModule.ts. */
class AppUpdaterModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("AppUpdater")
    Events("onDownloadChange")
    OnCreate { UpdateDownloads.onChange = { sendEvent("onDownloadChange", it) } }
    OnDestroy { UpdateDownloads.onChange = null }

    AsyncFunction("download") { o: Map<String, Any?> ->
      UpdateDownloads.enqueue(
        context,
        url = o["url"] as String,
        version = o["version"] as String,
        size = (o["size"] as? Number)?.toLong() ?: 0,
        title = o["title"] as String,
        description = o["description"] as String,
        wifiOnly = o["wifiOnly"] == true,
        ready = UpdateDownloads.ReadyText(o["readyTitle"] as String, o["readyText"] as String, o["channelName"] as String),
      )
    }
    AsyncFunction("status") { UpdateDownloads.state(context) }
    AsyncFunction("cancel") { UpdateDownloads.cancel(context) }
    AsyncFunction("install") {
      val intent = UpdateDownloads.installIntent(context) ?: return@AsyncFunction false
      context.startActivity(intent)
      true
    }
    AsyncFunction("clean") { installed: String -> UpdateDownloads.clean(context, installed) }
  }
}
