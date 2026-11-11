package expo.modules.docreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.kxml2.io.KXmlParser
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class OfficeTextTest {
  private val reader = OfficeText { KXmlParser() }

  private fun zip(files: Map<String, String>): File {
    val f = File.createTempFile("office", ".zip").apply { deleteOnExit() }
    ZipOutputStream(f.outputStream()).use { z ->
      for ((name, body) in files) {
        z.putNextEntry(ZipEntry(name))
        z.write(body.toByteArray())
        z.closeEntry()
      }
    }
    return f
  }

  private val w = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\""
  private val a = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\""
  private val r = "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\""

  @Test
  fun docx() {
    val doc = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document $w><w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>北京大学 课程通知</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>World</w:t></w:r><w:r><w:tab/><w:t>A &amp; B &lt;C&gt; &#x4E2D;</w:t></w:r></w:p>
<w:p><w:r><w:t>line1</w:t><w:br/><w:t>line2</w:t></w:r></w:p>
<w:p/>
<w:tbl><w:tblPr/>
<w:tr><w:tc><w:p><w:r><w:t>课程</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Room</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>高等数学</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>理教 101</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:delText>deleted</w:delText><w:t>End.</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>"""
    val out = reader.read(zip(mapOf("word/document.xml" to doc, "[Content_Types].xml" to "<Types/>")), "docx")
    assertNull(out.units)
    assertEquals(
      listOf("北京大学 课程通知", "Hello World\tA & B <C> 中", "line1\nline2", "", "课程\tRoom", "高等数学\t理教 101", "End.").joinToString("\n"),
      out.text,
    )
  }

  @Test
  fun xlsx() {
    val files = mapOf(
      "xl/workbook.xml" to """<workbook $r><sheets>
<sheet name="成绩" sheetId="1" r:id="rId1"/><sheet name="Notes &amp; misc" sheetId="2" r:id="rId2"/></sheets></workbook>""",
      "xl/_rels/workbook.xml.rels" to """<Relationships>
<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="x/worksheet" Target="/xl/worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="x/sharedStrings" Target="sharedStrings.xml"/></Relationships>""",
      "xl/sharedStrings.xml" to """<sst count="4" uniqueCount="4">
<si><t>姓名</t></si><si><t>Score</t></si>
<si><r><rPr><b/></rPr><t>张</t></r><r><t xml:space="preserve">三</t></r><rPh><t>zhang</t></rPh></si>
<si><t>remark</t></si></sst>""",
      "xl/worksheets/sheet1.xml" to """<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2" t="s" s="1"><v>2</v></c><c r="B2"><v>95.5</v></c><c r="D2" t="b"><v>1</v></c></row>
<row r="3"><c r="A3" s="2"/></row>
<row r="4"><c r="C4" t="inlineStr"><is><t>inline &lt;ok&gt;</t></is></c></row>
</sheetData></worksheet>""",
      "xl/worksheets/sheet2.xml" to """<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c><c r="B1" t="str"><f>A1</f><v>calc</v></c></row></sheetData></worksheet>""",
    )
    val out = reader.read(zip(files), "xlsx")
    assertEquals(2, out.units)
    assertEquals(
      listOf("## Sheet: 成绩", "姓名\tScore", "张三\t95.5\t\tTRUE", "\t\tinline <ok>", "", "## Sheet: Notes & misc", "remark\tcalc").joinToString("\n"),
      out.text,
    )
  }

  @Test
  fun xlsxCapsRows() {
    val rows = (0 until 5003).joinToString("") { "<row r=\"${it + 1}\"><c r=\"A${it + 1}\"><v>$it</v></c></row>" }
    val out = reader.read(
      zip(
        mapOf(
          "xl/workbook.xml" to "<workbook $r><sheets><sheet name=\"Big\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
          "xl/worksheets/sheet1.xml" to "<worksheet><sheetData>$rows</sheetData></worksheet>",
        ),
      ),
      "xlsx",
    )
    val lines = out.text.split("\n")
    assertEquals(5002, lines.size)
    assertEquals("4999", lines[5000])
    assertEquals("… (3 more rows)", lines.last())
  }

  @Test
  fun pptx() {
    fun slide(body: String) =
      "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" $a><p:cSld><p:spTree>$body</p:spTree></p:cSld></p:sld>"
    fun sp(paras: String) = "<p:sp><p:txBody><a:bodyPr/>$paras</p:txBody></p:sp>"
    val files = mapOf(
      "ppt/slides/slide1.xml" to slide(
        sp("<a:p><a:r><a:t>欢迎 Welcome</a:t></a:r></a:p>") +
          sp("<a:p><a:pPr lvl=\"1\"/><a:r><a:t>Point </a:t></a:r><a:r><a:t>one</a:t></a:r></a:p><a:p><a:r><a:t>二</a:t></a:r><a:br/><a:r><a:t>三</a:t></a:r></a:p>"),
      ),
      "ppt/slides/slide10.xml" to slide(sp("<a:p><a:r><a:t>Last &amp; final</a:t></a:r></a:p>")),
      "ppt/slides/slide2.xml" to slide(sp("<a:p><a:r><a:t>Second</a:t></a:r></a:p><a:p/>")),
      "ppt/slides/_rels/slide1.xml.rels" to
        "<Relationships><Relationship Id=\"rId2\" Type=\"x/notesSlide\" Target=\"../notesSlides/notesSlide7.xml\"/></Relationships>",
      "ppt/notesSlides/notesSlide7.xml" to slide(
        sp("<a:p><a:r><a:t>Speak slowly 慢一点</a:t></a:r></a:p>") +
          sp("<a:p><a:fld id=\"{X}\" type=\"slidenum\"><a:t>1</a:t></a:fld></a:p>"),
      ),
      "ppt/notesSlides/notesSlide2.xml" to slide(sp("<a:p><a:r><a:t>note two</a:t></a:r></a:p>")),
    )
    val out = reader.read(zip(files), "pptx")
    assertEquals(3, out.units)
    assertEquals(
      listOf(
        "## Slide 1", "欢迎 Welcome", "Point one", "二\n三", "Notes: Speak slowly 慢一点", "",
        "## Slide 2", "Second", "Notes: note two", "",
        "## Slide 3", "Last & final",
      ).joinToString("\n"),
      out.text,
    )
  }

  @Test
  fun damaged() {
    val junk = File.createTempFile("junk", ".docx").apply { deleteOnExit(); writeText("not a zip at all, sorry") }
    for (kind in listOf("docx", "xlsx", "pptx")) assertThrows(DamagedFileException::class.java) { reader.read(junk, kind) }

    val docx = zip(mapOf("word/document.xml" to "<w:document $w><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>"))
    val truncated = File.createTempFile("cut", ".docx").apply { deleteOnExit(); writeBytes(docx.readBytes().let { it.copyOf(it.size - 30) }) }
    assertThrows(DamagedFileException::class.java) { reader.read(truncated, "docx") }

    assertThrows(DamagedFileException::class.java) { reader.read(docx, "pptx") }
    assertThrows(DamagedFileException::class.java) { reader.read(docx, "xlsx") }
    assertThrows(DamagedFileException::class.java) { reader.read(zip(mapOf("foo.xml" to "<x/>")), "docx") }
  }
}
