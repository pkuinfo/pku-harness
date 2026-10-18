package expo.modules.campushttp

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayInputStream
import java.net.Proxy
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * HTTP client for PKU campus services (pku-harness docs/ARCHITECTURE.md §9).
 *
 * React Native's fetch can't do what the campus login chains need, so this module offers named
 * sessions with: their own cookie jar, manual redirects (read Location and walk SSO chains, as
 * pkucli does with reqwest Policy::none), HTTP/1.1 only, no proxy (campus-only hosts must be
 * reached directly) and an extra trust anchor for PKU hosts that serve a broken chain
 * (pkucli crates/common/src/tls.rs). Credentials never pass through here in clear except as
 * request bodies the JS layer builds; nothing is logged.
 */

private const val ALPHASSL_CA_2025 = """
-----BEGIN CERTIFICATE-----
MIIFjTCCA3WgAwIBAgIRAIN9TriekS/nLK07x2kt3CAwDQYJKoZIhvcNAQELBQAw
TDEgMB4GA1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjYxEzARBgNVBAoTCkds
b2JhbFNpZ24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMjUwNTIxMDIzNjUyWhcN
MjcwNTIxMDAwMDAwWjBVMQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2ln
biBudi1zYTErMCkGA1UEAxMiR2xvYmFsU2lnbiBHQ0MgUjYgQWxwaGFTU0wgQ0Eg
MjAyNTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ/oiu0Bviq52UUE
ADbFWmgu3rC7KDSMoorLN1Wd03McG3Z1aP71DlPCE33838r72Dfuj5M9LXfiQLJp
Au6MwNExmKOzothw4x0zGf5oBYyrCMGm3fBpLPafwYQ3MchBOWMTbf83rKUPLH48
KCJ0MnU8GUl8oA/J81wIvbbKPuNrFf6hvJDccjzc4NyxLz3A89zjV2g5whCg5O0u
9YX4Zxk9JHuc/LvllOJO4waAYLjbWBJkz3rV3ts1SmSYnJqmyRTIjXwQgRvhEYqt
DbRskt0W7M6cPwCze3GTBN2UHNpHkMs3YmVxku68I0aOQn5+uz//fDROP3z1Z/7I
APteRtECAwEAAaOCAV8wggFbMA4GA1UdDwEB/wQEAwIBhjAdBgNVHSUEFjAUBggr
BgEFBQcDAQYIKwYBBQUHAwIwEgYDVR0TAQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQU
xbSTj28r3B5Iv7cQMIXO0bK7SC0wHwYDVR0jBBgwFoAUrmwFo5MT4qLn4tcc1sfw
f8hnU6AwewYIKwYBBQUHAQEEbzBtMC4GCCsGAQUFBzABhiJodHRwOi8vb2NzcDIu
Z2xvYmFsc2lnbi5jb20vcm9vdHI2MDsGCCsGAQUFBzAChi9odHRwOi8vc2VjdXJl
Lmdsb2JhbHNpZ24uY29tL2NhY2VydC9yb290LXI2LmNydDA2BgNVHR8ELzAtMCug
KaAnhiVodHRwOi8vY3JsLmdsb2JhbHNpZ24uY29tL3Jvb3QtcjYuY3JsMCEGA1Ud
IAQaMBgwCAYGZ4EMAQIBMAwGCisGAQQBoDIKAQMwDQYJKoZIhvcNAQELBQADggIB
AB/uvBuZf4CiuSahwiXn4geF52roAH+6jxsEPTXTfb7bbeMDXsYgRRsOTNA70ruZ
Tnz5DfFMuBhNoFhIFb0qR1izdy6VkdKOqFPNF2dOFI1EcnY9l2ory9mrzHqVbrL4
vzUd17FLUVyjTVU7PAv4nxyhnO1GTeT83YlrdRF31NyR6bvZVTEERHmpbWSgeveJ
LRtaMzlGWiLZ8IwkH7o6GH3jp/KPtDW4Npu8w64HrRZdN2pqQhi7+YKwfHM7H+2U
dM1BGN0sjOWMVbMSB9MtCsleS2Mb7TRZEbOHxECJLLIluQypZr7Pol3+hAqrhyKI
k+6y+Da0NeDuWxW59Ku4NvClqW1UFX1SpfNGhzVfp/CH+vPM1tySomx2jE0EnYZu
GwVucXPBsp5nUWqUV9+143glVuS7GTg9hFPjNBInn17HbCoIIQIOzj5Vd9bK3A9U
GxXNpwenDHEalCsD/4eQYDHPhFE7sNe0D/OXu+FAM02VZkARx37Jp4bDdujvgL9P
vZPR3wThvDN1CTU8Bc3xea3yKFAraKcPZLkhReQUAm2VpR+HSJRPlUpYizlF9WkL
h3KcAVCBJWvnOkVwxyU5QJMcnwW95JlOtx+9100GL99jHE5rs3gXp7F4bg8H01QT
9jVOhBBmQ7nQoXuwI0tqal2QUqZz3eeu62CU7xBwtfYR
-----END CERTIFICATE-----
"""

class SessionOptions : Record {
  @Field val userAgent: String? = null
  @Field val headers: Map<String, String> = emptyMap()
  @Field val followRedirects: Boolean = false
}

class RequestOptions : Record {
  @Field val url: String = ""
  @Field val method: String = "GET"
  @Field val headers: Map<String, String> = emptyMap()
  @Field val body: String? = null
  @Field val contentType: String? = null
  @Field val followRedirects: Boolean? = null
  @Field val timeoutMs: Int = 20000
  /** "text" (UTF-8) or "base64" (binary, e.g. captcha images). */
  @Field val responseType: String = "text"
}

class StoredCookie : Record {
  @Field val name: String = ""
  @Field val value: String = ""
  @Field val domain: String = ""
  @Field val path: String = "/"
  @Field val expiresAt: Double = 0.0
  @Field val secure: Boolean = false
  @Field val httpOnly: Boolean = false
  @Field val hostOnly: Boolean = false
}

/** In-memory jar: replaces cookies by (name, domain, path); drops expired ones. */
private class MemoryJar : CookieJar {
  val cookies = mutableListOf<Cookie>()

  @Synchronized
  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
    for (c in cookies) {
      this.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
      if (c.expiresAt > System.currentTimeMillis()) this.cookies.add(c)
    }
  }

  @Synchronized
  override fun loadForRequest(url: HttpUrl): List<Cookie> {
    val now = System.currentTimeMillis()
    this.cookies.removeAll { it.expiresAt <= now }
    return this.cookies.filter { it.matches(url) }
  }
}

private class Session(val client: OkHttpClient, val jar: MemoryJar, val options: SessionOptions)

class CampusHttpModule : Module() {
  private val sessions = ConcurrentHashMap<String, Session>()

  private val trust: Pair<SSLContext, X509TrustManager> by lazy { buildTrust() }

  override fun definition() = ModuleDefinition {
    Name("CampusHttp")

    Function("createSession") { id: String, options: SessionOptions ->
      val jar = MemoryJar()
      val (ssl, tm) = trust
      val client = OkHttpClient.Builder()
        .cookieJar(jar)
        .proxy(Proxy.NO_PROXY)
        .protocols(listOf(Protocol.HTTP_1_1))
        .followRedirects(options.followRedirects)
        .followSslRedirects(options.followRedirects)
        .sslSocketFactory(ssl.socketFactory, tm)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()
      sessions[id] = Session(client, jar, options)
    }

    Function("hasSession") { id: String -> sessions.containsKey(id) }

    Function("closeSession") { id: String ->
      sessions.remove(id)
      Unit
    }

    AsyncFunction("request") { id: String, options: RequestOptions ->
      val session = sessions[id] ?: throw SessionNotFound(id)
      val follow = options.followRedirects ?: session.options.followRedirects
      val client = session.client.newBuilder()
        .followRedirects(follow)
        .followSslRedirects(follow)
        .callTimeout(options.timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .build()

      val builder = Request.Builder().url(options.url)
      session.options.userAgent?.let { builder.header("User-Agent", it) }
      session.options.headers.forEach { (k, v) -> builder.header(k, v) }
      options.headers.forEach { (k, v) -> builder.header(k, v) }
      val method = options.method.uppercase()
      val text = options.body
      val body = when {
        text != null -> text.toRequestBody((options.contentType ?: "text/plain; charset=utf-8").toMediaTypeOrNull())
        method == "POST" || method == "PUT" -> ByteArray(0).toRequestBody(null)
        else -> null
      }
      builder.method(method, body)

      try {
        client.newCall(builder.build()).execute().use { resp ->
          val headers = mutableMapOf<String, String>()
          for (name in resp.headers.names()) {
            if (name.equals("set-cookie", ignoreCase = true)) continue
            headers[name.lowercase()] = resp.headers.values(name).joinToString(", ")
          }
          val bytes = resp.body?.bytes() ?: ByteArray(0)
          mapOf(
            "status" to resp.code,
            "url" to resp.request.url.toString(),
            "headers" to headers,
            "location" to resp.header("Location"),
            "body" to if (options.responseType == "base64") Base64.encodeToString(bytes, Base64.NO_WRAP) else String(bytes, Charsets.UTF_8),
          )
        }
      } catch (e: java.io.IOException) {
        throw NetworkError(e.message ?: e.javaClass.simpleName)
      }
    }

    Function("exportCookies") { id: String ->
      val session = sessions[id] ?: throw SessionNotFound(id)
      synchronized(session.jar) {
        session.jar.cookies.map {
          mapOf(
            "name" to it.name, "value" to it.value, "domain" to it.domain, "path" to it.path,
            "expiresAt" to it.expiresAt.toDouble(), "secure" to it.secure, "httpOnly" to it.httpOnly, "hostOnly" to it.hostOnly,
          )
        }
      }
    }

    Function("importCookies") { id: String, cookies: List<StoredCookie> ->
      val session = sessions[id] ?: throw SessionNotFound(id)
      val restored = cookies.mapNotNull { c ->
        runCatching {
          Cookie.Builder().name(c.name).value(c.value).path(c.path).expiresAt(c.expiresAt.toLong()).apply {
            if (c.hostOnly) hostOnlyDomain(c.domain) else domain(c.domain)
            if (c.secure) secure()
            if (c.httpOnly) httpOnly()
          }.build()
        }.getOrNull()
      }
      synchronized(session.jar) {
        for (c in restored) {
          session.jar.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
          session.jar.cookies.add(c)
        }
      }
    }

    Function("cookieValue") { id: String, url: String, name: String ->
      val session = sessions[id] ?: throw SessionNotFound(id)
      session.jar.loadForRequest(url.toHttpUrl()).firstOrNull { it.name == name }?.value
    }
  }

  /** System trust store plus the bundled AlphaSSL CA 2025 intermediate as an extra anchor. */
  private fun buildTrust(): Pair<SSLContext, X509TrustManager> {
    val systemTm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).run {
      init(null as KeyStore?)
      trustManagers.filterIsInstance<X509TrustManager>().first()
    }
    val extra = CertificateFactory.getInstance("X.509")
      .generateCertificate(ByteArrayInputStream(ALPHASSL_CA_2025.trim().toByteArray())) as X509Certificate
    val extraStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
      load(null, null)
      setCertificateEntry("alphassl-ca-2025", extra)
    }
    val extraTm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).run {
      init(extraStore)
      trustManagers.filterIsInstance<X509TrustManager>().first()
    }
    val combined = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = systemTm.checkClientTrusted(chain, authType)
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        try {
          systemTm.checkServerTrusted(chain, authType)
        } catch (e: CertificateException) {
          extraTm.checkServerTrusted(chain, authType)
        }
      }
      override fun getAcceptedIssuers(): Array<X509Certificate> = systemTm.acceptedIssuers + extraTm.acceptedIssuers
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(combined), null) }
    return ssl to combined
  }
}

private class SessionNotFound(id: String) : CodedException("ERR_NO_SESSION", "No campus HTTP session '$id'", null)

private class NetworkError(message: String) : CodedException("ERR_NETWORK", message, null)
