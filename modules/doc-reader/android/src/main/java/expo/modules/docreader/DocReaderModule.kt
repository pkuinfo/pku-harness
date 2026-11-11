package expo.modules.docreader

import android.content.Context
import android.net.Uri
import android.util.Xml
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Native document reading for chat attachments (see src/DocReaderModule.ts). Async functions
 * run off the JS thread; the file is read where it is (file://) or copied once (content://).
 */
class DocReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_READ", "No React context", null)

  private val office = OfficeText { Xml.newPullParser() }

  override fun definition() = ModuleDefinition {
    Name("DocReader")

    AsyncFunction("readPdf") { uri: String, engine: String? ->
      withFile(uri) { PdfText.read(context, it, engine).toMap() }
    }

    AsyncFunction("readOffice") { uri: String, kind: String ->
      withFile(uri) { office.read(it, kind).toMap() }
    }
  }

  private fun DocText.toMap(): Map<String, Any?> = mapOf("text" to text, "units" to units)

  private fun <T> withFile(uri: String, read: (File) -> T): T {
    val parsed = Uri.parse(uri)
    var temp: File? = null
    try {
      val file = when (parsed.scheme) {
        "file", null -> File(parsed.path ?: uri)
        "content" -> File.createTempFile("doc", null, context.cacheDir).also { f ->
          temp = f
          val input = context.contentResolver.openInputStream(parsed) ?: throw CodedException("ERR_READ", "Cannot open $uri", null)
          input.use { i -> f.outputStream().use { o -> i.copyTo(o) } }
        }
        else -> throw CodedException("ERR_READ", "Unsupported uri $uri", null)
      }
      if (!file.canRead()) throw CodedException("ERR_READ", "Cannot read $uri", null)
      return read(file)
    } catch (e: DamagedFileException) {
      throw CodedException("ERR_DAMAGED", e.message, e)
    } catch (e: EncryptedPdfException) {
      throw CodedException("ERR_ENCRYPTED", e.message, e)
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw CodedException("ERR_READ", e.message ?: e.javaClass.simpleName, e)
    } finally {
      temp?.delete()
    }
  }
}
