package expo.modules.docreader

import org.xmlpull.v1.XmlPullParser
import java.io.File
import java.io.InputStream
import java.util.zip.ZipException
import java.util.zip.ZipFile

class DamagedFileException : Exception("This file is damaged or not a .docx/.xlsx/.pptx file")

data class DocText(val text: String, val units: Int? = null)

/**
 * Plain text of Office Open XML documents (.docx / .xlsx / .pptx): the zip is opened with
 * [ZipFile] (only the parts we need are inflated) and each XML part is streamed through an
 * [XmlPullParser] with namespaces on, so element names are matched by local name.
 */
class OfficeText(private val newParser: () -> XmlPullParser) {
  fun read(file: File, kind: String): DocText {
    val zip = try {
      ZipFile(file)
    } catch (e: ZipException) {
      throw DamagedFileException()
    }
    return zip.use {
      try {
        when (kind) {
          "docx" -> DocText(docx(it))
          "xlsx" -> xlsx(it)
          "pptx" -> pptx(it)
          else -> throw DamagedFileException()
        }
      } catch (e: DamagedFileException) {
        throw e
      } catch (e: Exception) {
        // Malformed XML or a corrupt entry
        throw DamagedFileException()
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  // helpers

  private fun parse(stream: InputStream, onEvent: (XmlPullParser, Int) -> Unit) {
    stream.use { input ->
      val p = newParser()
      p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
      p.setInput(input, null)
      var event = p.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        onEvent(p, event)
        event = p.next()
      }
    }
  }

  private fun ZipFile.part(name: String): InputStream? = getEntry(name)?.let { getInputStream(it) }

  private fun ZipFile.need(name: String): InputStream = part(name) ?: throw DamagedFileException()

  private fun tidy(lines: List<String>): String =
    lines.joinToString("\n") { it.trimEnd(' ', '\u00a0') }.replace(Regex("\n{3,}"), "\n\n").trim()

  // ---------------------------------------------------------------------------------------
  // docx

  private class Table {
    val cells = mutableListOf<String>()
    val paras = mutableListOf<String>()
  }

  private fun docx(zip: ZipFile): String {
    val lines = mutableListOf<String>()
    val tables = ArrayDeque<Table>()
    val para = StringBuilder()
    var inText = false
    // Paragraph properties also hold <w:tab> (tab stops), which are not text.
    var inProps = 0

    fun endPara() {
      val t = tables.lastOrNull()
      if (t != null) t.paras += para.toString() else lines += para.toString()
      para.setLength(0)
    }

    parse(zip.need("word/document.xml")) { p, event ->
      when (event) {
        XmlPullParser.TEXT -> if (inText) para.append(p.text)
        XmlPullParser.START_TAG -> when (p.name) {
          // w:t is text; w:delText (tracked deletions) is skipped
          "t" -> inText = true
          "pPr" -> inProps++
          "tab" -> if (inProps == 0) para.append('\t')
          "br", "cr" -> para.append('\n')
          "tbl" -> tables.addLast(Table())
        }
        XmlPullParser.END_TAG -> when (p.name) {
          "t" -> inText = false
          "pPr" -> inProps--
          "p" -> endPara()
          "tbl" -> tables.removeLastOrNull()
          "tc" -> tables.lastOrNull()?.let { t ->
            t.cells += t.paras.map { it.replace(Regex("[\t\n]+"), " ").trim() }.filter { it.isNotEmpty() }.joinToString(" ")
            t.paras.clear()
          }
          "tr" -> tables.lastOrNull()?.let { t ->
            val row = t.cells.joinToString("\t")
            t.cells.clear()
            t.paras.clear()
            val parent = if (tables.size >= 2) tables[tables.size - 2] else null
            if (parent != null) parent.paras += row else lines += row
          }
        }
      }
    }
    return tidy(lines)
  }

  // ---------------------------------------------------------------------------------------
  // xlsx

  private fun colIndex(ref: String): Int {
    var n = 0
    var any = false
    for (ch in ref) {
      if (!ch.isLetter()) break
      n = n * 26 + (ch.uppercaseChar() - 'A' + 1)
      any = true
    }
    return if (any) n - 1 else -1
  }

  private fun resolveTarget(target: String): String {
    if (target.startsWith("/")) return target.substring(1)
    val out = mutableListOf("xl")
    for (seg in target.split('/')) {
      when (seg) {
        ".." -> out.removeLastOrNull()
        "", "." -> {}
        else -> out += seg
      }
    }
    return out.joinToString("/")
  }

  private fun xlsx(zip: ZipFile): DocText {
    val rels = mutableMapOf<String, String>()
    zip.part("xl/_rels/workbook.xml.rels")?.let { s ->
      parse(s) { p, event ->
        if (event == XmlPullParser.START_TAG && p.name == "Relationship") {
          val id = p.getAttributeValue(null, "Id")
          val target = p.getAttributeValue(null, "Target")
          if (id != null && target != null) rels[id] = resolveTarget(target)
        }
      }
    }

    // Shared strings: every <t> of an <si>, phonetic runs (<rPh>) left out.
    val shared = mutableListOf<String>()
    zip.part("xl/sharedStrings.xml")?.let { s ->
      val cur = StringBuilder()
      var inT = false
      var inPh = 0
      parse(s) { p, event ->
        when (event) {
          XmlPullParser.START_TAG -> when (p.name) {
            "si" -> cur.setLength(0)
            "t" -> inT = true
            "rPh" -> inPh++
          }
          XmlPullParser.END_TAG -> when (p.name) {
            "si" -> shared += cur.toString()
            "t" -> inT = false
            "rPh" -> inPh--
          }
          XmlPullParser.TEXT -> if (inT && inPh == 0) cur.append(p.text)
        }
      }
    }

    val sheets = mutableListOf<Pair<String, String?>>()
    parse(zip.need("xl/workbook.xml")) { p, event ->
      if (event == XmlPullParser.START_TAG && p.name == "sheet") {
        var rid: String? = null
        for (i in 0 until p.attributeCount) if (p.getAttributeName(i) == "id") rid = p.getAttributeValue(i)
        sheets += (p.getAttributeValue(null, "name") ?: "Sheet${sheets.size + 1}") to rid?.let { rels[it] }
      }
    }
    if (sheets.isEmpty()) throw DamagedFileException()

    val blocks = sheets.mapIndexed { i, (name, path) ->
      // Fall back to positional sheetN.xml when the rels part is missing or odd.
      val stream = path?.let { zip.part(it) } ?: zip.part("xl/worksheets/sheet${i + 1}.xml")
      val lines = mutableListOf("## Sheet: $name")
      if (stream != null) lines += sheetRows(stream, shared)
      lines.joinToString("\n")
    }
    return DocText(blocks.joinToString("\n\n"), sheets.size)
  }

  private fun sheetRows(stream: InputStream, shared: List<String>): List<String> {
    val out = mutableListOf<String>()
    var kept = 0
    var skipped = 0
    val cells = mutableListOf<String>()
    var next = 0
    var col = 0
    var type: String? = null
    val value = StringBuilder()
    var inValue = false
    var inInline = false
    var inPh = 0

    parse(stream) { p, event ->
      when (event) {
        XmlPullParser.START_TAG -> when (p.name) {
          "row" -> { cells.clear(); next = 0 }
          "c" -> {
            val ref = p.getAttributeValue(null, "r")
            val idx = ref?.let { colIndex(it) } ?: -1
            col = if (idx >= 0) idx else next
            next = col + 1
            type = p.getAttributeValue(null, "t")
            value.setLength(0)
          }
          "v" -> inValue = true
          "is" -> inInline = true
          "t" -> if (inInline) inValue = true
          "rPh" -> inPh++
        }
        XmlPullParser.TEXT -> if (inValue && inPh == 0) value.append(p.text)
        XmlPullParser.END_TAG -> when (p.name) {
          "v" -> inValue = false
          "t" -> if (inInline) inValue = false
          "is" -> inInline = false
          "rPh" -> inPh--
          "c" -> {
            val raw = value.toString()
            val v = when (type) {
              "s" -> raw.trim().toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
              "b" -> if (raw.isEmpty()) "" else if (raw.trim() == "1") "TRUE" else "FALSE"
              else -> raw
            }.replace(Regex("\r?\n"), " ").replace('\t', ' ')
            if (v.isNotEmpty()) {
              while (cells.size <= col) cells += ""
              cells[col] = v
            }
          }
          "row" -> if (cells.any { it.isNotBlank() }) {
            if (kept >= MAX_SHEET_ROWS) skipped++ else { kept++; out += cells.joinToString("\t") }
          }
        }
      }
    }
    if (skipped > 0) out += "… ($skipped more rows)"
    return out
  }

  // ---------------------------------------------------------------------------------------
  // pptx

  /** DrawingML paragraphs (a:p) as lines; a:br is a newline; fields (slide numbers) dropped. */
  private fun drawingText(stream: InputStream): List<String> {
    val lines = mutableListOf<String>()
    val para = StringBuilder()
    var inText = false
    var inField = 0
    parse(stream) { p, event ->
      when (event) {
        XmlPullParser.TEXT -> if (inText && inField == 0) para.append(p.text)
        XmlPullParser.START_TAG -> when (p.name) {
          "t" -> inText = true
          "fld" -> inField++
          "br" -> para.append('\n')
        }
        XmlPullParser.END_TAG -> when (p.name) {
          "t" -> inText = false
          "fld" -> inField = maxOf(0, inField - 1)
          "p" -> { lines += para.toString(); para.setLength(0) }
        }
      }
    }
    val out = lines.map { it.trimEnd() }.toMutableList()
    while (out.isNotEmpty() && out.last().isEmpty()) out.removeAt(out.size - 1)
    while (out.isNotEmpty() && out.first().isEmpty()) out.removeAt(0)
    return out
  }

  private fun pptx(zip: ZipFile): DocText {
    val slide = Regex("^ppt/slides/slide(\\d+)\\.xml$")
    val slides = zip.entries().asSequence()
      .mapNotNull { e -> slide.find(e.name)?.groupValues?.get(1)?.toIntOrNull()?.let { it to e.name } }
      .sortedBy { it.first }
      .toList()
    if (slides.isEmpty()) throw DamagedFileException()

    val notesTarget = Regex("Target\\s*=\\s*\"[^\"]*?notesSlides/(notesSlide\\d+\\.xml)\"")
    val blocks = slides.mapIndexed { i, (n, name) ->
      val lines = mutableListOf("## Slide ${i + 1}")
      lines += drawingText(zip.need(name))
      val rels = zip.part("ppt/slides/_rels/slide$n.xml.rels")?.use { it.readBytes().decodeToString() }
      val target = rels?.let { notesTarget.find(it)?.groupValues?.get(1) } ?: "notesSlide$n.xml"
      zip.part("ppt/notesSlides/$target")?.let { s ->
        val notes = drawingText(s).filter { it.isNotBlank() }
        if (notes.isNotEmpty()) lines += "Notes: ${notes.joinToString("\n")}"
      }
      lines.joinToString("\n")
    }
    return DocText(blocks.joinToString("\n\n"), slides.size)
  }

  companion object {
    const val MAX_SHEET_ROWS = 5000
  }
}
