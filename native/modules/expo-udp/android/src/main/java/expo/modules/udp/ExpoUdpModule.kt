package expo.modules.udp

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

class ExpoUdpModule : Module() {
  private val sockets = ConcurrentHashMap<Int, UdpSocketWrapper>()
  private val nextId = AtomicInteger(1)

  override fun definition() = ModuleDefinition {
    Name("ExpoUdp")

    Events("onUdpMessage")

    AsyncFunction("createSocket") { port: Int ->
      val id = nextId.getAndIncrement()
      val wrapper = UdpSocketWrapper(id, port) { data, address, remotePort ->
        sendEvent("onUdpMessage", mapOf(
          "socketId" to id,
          "data" to data.map { it.toInt() and 0xFF },
          "address" to address,
          "port" to remotePort,
        ))
      }
      wrapper.bind()
      sockets[id] = wrapper
      id
    }

    Function("setBroadcast") { socketId: Int, enabled: Boolean ->
      sockets[socketId]?.setBroadcast(enabled)
    }

    // Returns bytes sent, or -1 on failure (details in diagnostics().lastError).
    Function("send") { socketId: Int, data: List<Int>, address: String, port: Int ->
      val socket = sockets[socketId] ?: return@Function -1
      socket.send(ByteArray(data.size) { data[it].toByte() }, address, port)
    }

    Function("closeSocket") { socketId: Int ->
      sockets.remove(socketId)?.close()
    }

    Function("diagnostics") { socketId: Int ->
      sockets[socketId]?.diagnostics() ?: mapOf("error" to "unknown socket $socketId")
    }

    Function("getBroadcastAddress") {
      broadcastAddress()
    }

    OnDestroy {
      sockets.values.forEach { it.close() }
      sockets.clear()
    }
  }

  private inner class UdpSocketWrapper(
    val id: Int,
    val port: Int,
    val onMessage: (ByteArray, String, Int) -> Unit
  ) {
    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    @Volatile private var receiving = false
    @Volatile private var broadcast = false
    @Volatile private var lastError: String? = null
    private val packetsSent = AtomicInteger(0)
    private val bytesSent = AtomicInteger(0)
    private val packetsReceived = AtomicInteger(0)

    fun bind() {
      socket = DatagramSocket(null).apply {
        reuseAddress = true
        bind(InetSocketAddress(port))
      }
      receiving = true
      startReceiving()
    }

    fun setBroadcast(enabled: Boolean) {
      socket?.broadcast = enabled
      broadcast = enabled
      if (enabled) {
        if (multicastLock != null) return
        val context = appContext.reactContext ?: return
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        multicastLock = wifi?.createMulticastLock("expo-udp-$id")?.apply {
          setReferenceCounted(false)
          acquire()
        }
      } else {
        releaseLock()
      }
    }

    fun send(data: ByteArray, address: String, port: Int): Int {
      val socket = socket ?: return -1
      return try {
        socket.send(DatagramPacket(data, data.size, InetAddress.getByName(address), port))
        packetsSent.incrementAndGet()
        bytesSent.addAndGet(data.size)
        data.size
      } catch (e: Exception) {
        lastError = "send $address:$port: ${e.message}"
        -1
      }
    }

    fun close() {
      receiving = false
      releaseLock()
      socket?.close()
      socket = null
    }

    fun diagnostics(): Map<String, Any?> = mapOf(
      "socketId" to id,
      "boundPort" to (socket?.localPort ?: -1),
      "broadcast" to broadcast,
      "packetsSent" to packetsSent.get(),
      "bytesSent" to bytesSent.get(),
      "packetsReceived" to packetsReceived.get(),
      "lastError" to lastError,
    )

    private fun releaseLock() {
      multicastLock?.takeIf { it.isHeld }?.release()
      multicastLock = null
    }

    private fun startReceiving() {
      val socket = socket ?: return
      thread(name = "expo-udp-$id") {
        val buffer = ByteArray(2048)
        while (receiving) {
          try {
            val packet = DatagramPacket(buffer, buffer.size)
            socket.receive(packet)
            packetsReceived.incrementAndGet()
            onMessage(buffer.copyOf(packet.length), packet.address.hostAddress ?: "", packet.port)
          } catch (e: Exception) {
            if (receiving) lastError = "receive: ${e.message}"
            break
          }
        }
      }
    }
  }
}

/** Subnet broadcast address of the Wi-Fi interface, falling back to any active IPv4 interface. */
private fun broadcastAddress(): String? {
  var fallback: String? = null
  val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
  for (iface in interfaces) {
    if (!iface.isUp || iface.isLoopback) continue
    for (addr in iface.interfaceAddresses) {
      if (addr.address !is Inet4Address) continue
      val broadcast = addr.broadcast?.hostAddress ?: continue
      if (iface.name.startsWith("wlan")) return broadcast
      if (fallback == null) fallback = broadcast
    }
  }
  return fallback
}
