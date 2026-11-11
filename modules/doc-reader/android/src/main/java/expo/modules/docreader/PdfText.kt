package expo.modules.docreader

import android.content.Context
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.annotation.RequiresApi
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.io.IOException

class EncryptedPdfException : Exception("This PDF is password protected")

/**
 * Text of a PDF, page by page ("## Page N" before each). Android 15+ reads it with the system
 * PDF engine (PdfRenderer.Page.getTextContents, pdfium); older versions with PdfBox-Android.
 * Scanned PDFs have no text layer: their pages come back empty (no OCR).
 */
object PdfText {
  const val MAX_PAGES = 400

  fun read(context: Context, file: File, engine: String? = null): DocText {
    val platform = engine != "pdfbox" && Build.VERSION.SDK_INT >= 35
    val (count, pages) = if (platform) system(file) else pdfbox(context, file)
    val out = pages.mapIndexed { i, text -> "## Page ${i + 1}\n${text.trim()}" }.toMutableList()
    if (count > MAX_PAGES) out += "… (${count - MAX_PAGES} more pages not read)"
    return DocText(out.joinToString("\n\n"), count)
  }

  @RequiresApi(35)
  private fun system(file: File): Pair<Int, List<String>> {
    val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = try {
      PdfRenderer(fd)
    } catch (e: SecurityException) {
      fd.close()
      throw EncryptedPdfException()
    } catch (e: IOException) {
      fd.close()
      throw DamagedFileException()
    }
    // PdfRenderer closes the descriptor it was given.
    return renderer.use { r ->
      r.pageCount to (0 until minOf(r.pageCount, MAX_PAGES)).map { i ->
        r.openPage(i).use { page -> page.textContents.joinToString("\n") { it.text } }
      }
    }
  }

  @Volatile private var pdfboxReady = false

  private fun pdfbox(context: Context, file: File): Pair<Int, List<String>> {
    if (!pdfboxReady) {
      PDFBoxResourceLoader.init(context.applicationContext)
      pdfboxReady = true
    }
    val doc = try {
      PDDocument.load(file)
    } catch (e: InvalidPasswordException) {
      throw EncryptedPdfException()
    } catch (e: IOException) {
      throw DamagedFileException()
    }
    return doc.use { d ->
      val stripper = PDFTextStripper().apply { sortByPosition = true }
      d.numberOfPages to (1..minOf(d.numberOfPages, MAX_PAGES)).map { n ->
        stripper.startPage = n
        stripper.endPage = n
        stripper.getText(d)
      }
    }
  }
}
