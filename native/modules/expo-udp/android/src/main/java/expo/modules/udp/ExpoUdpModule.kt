package expo.modules.udp

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Process
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
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
      val wrapper = UdpSocketWrapper(id, port) { data, address, remotePort, lagMs ->
        sendEvent("onUdpMessage", mapOf(
          "socketId" to id,
          "data" to data.map { it.toInt() and 0xFF },
          "address" to address,
          "port" to remotePort,
          "lagMs" to lagMs,
        ))
      }
      wrapper.bind()
      sockets[id] = wrapper
      id
    }

    Function("setBroadcast") { socketId: Int, enabled: Boolean ->
      sockets[socketId]?.setBroadcast(enabled)
    }

    Function("configureSession") { socketId: Int, playerId: Int, address: String, port: Int ->
      sockets[socketId]?.configureSession(playerId, address, port) ?: false
    }

    Function("sendState") { socketId: Int, buttons: Int, h: Int, v: Int ->
      sockets[socketId]?.sendState(buttons, h, v) ?: -1
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

    Function("copyToClipboard") { text: String ->
      val context = appContext.reactContext ?: return@Function false
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return@Function false
      clipboard.setPrimaryClip(ClipData.newPlainText("SquadPad Diagnostics", text))
      true
    }
    OnDestroy {
      sockets.values.forEach { it.close() }
      sockets.clear()
    }
  }

  private inner class UdpSocketWrapper(
    val id: Int,
    val port: Int,
    val onMessage: (ByteArray, String, Int, Int) -> Unit
  ) {
    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var lowLatencyLock: WifiManager.WifiLock? = null
    private var highPerfLock: WifiManager.WifiLock? = null
    @Volatile private var receiving = false
    @Volatile private var broadcastRequested = false
    @Volatile private var lastError: String? = null
    @Volatile private var cachedHost: String? = null
    @Volatile private var cachedAddress: InetAddress? = null
    private val packetsSent = AtomicInteger(0)
    private val bytesSent = AtomicInteger(0)
    private val packetsReceived = AtomicInteger(0)

    // Native BombSquad V2 state ring-buffer so ACK-clocking, retransmits, and
    // RTT measurement run on the native socket thread without JNI/JS queue lag.
    private val stateLock = Any()
    @Volatile private var sessionActive = false
    private var sessionPlayerId = -1
    private var sessionHost = ""
    private var sessionPort = 43210
    private val stateBuffer = IntArray(256)
    private val stateBirthMs = LongArray(256)
    private var writeIndex = 0
    private var ackIndex = 0
    private var lastButtons = 0
    private var lastH = 128
    private var lastV = 128
    private var pendingState = -1
    private var lastSendMs = 0L
    private var lastAckEmitMs = 0L
    private var smoothedLagMs = 0
    private val sendBuf = ByteArray(40)

    // DatagramSocket.receive() holds the socket monitor while blocked, and option
    // setters like setBroadcast() are synchronized on it too. Configure the socket
    // before the receive thread starts and give receive() a short timeout so the
    // native thread also handles 35 ms retransmits without waking JS.
    fun bind() {
      // Build outside `apply`: inside it, `port` would resolve to DatagramSocket.port (-1).
      val address = InetSocketAddress(port)
      socket = DatagramSocket(null).apply {
        reuseAddress = true
        this.broadcast = true
        soTimeout = RECEIVE_TIMEOUT_MS
        try {
          trafficClass = 0xB8 // DSCP EF (WMM Voice/Game queue)
        } catch (_: Exception) {
          try {
            trafficClass = 0x10 // IPTOS_LOWDELAY fallback
          } catch (_: Exception) {
          }
        }
        bind(address)
      }
      acquireWifiLocks()
      receiving = true
      startReceiving()
    }
    // SO_BROADCAST is always on; this only controls the Wi-Fi multicast lock that
    // lets broadcast replies through while discovery runs.
    fun setBroadcast(enabled: Boolean) {
      broadcastRequested = enabled
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

    fun configureSession(playerId: Int, address: String, port: Int): Boolean {
      try {
        InetAddress.getByName(address).also {
          cachedHost = address
          cachedAddress = it
        }
      } catch (_: Exception) {
      }
      synchronized(stateLock) {
        sessionPlayerId = playerId and 0xFF
        sessionHost = address
        sessionPort = port
        writeIndex = 0
        ackIndex = 0
        lastButtons = 0
        lastH = 128
        lastV = 128
        pendingState = -1
        lastSendMs = 0L
        lastAckEmitMs = 0L
        smoothedLagMs = 0
        sessionActive = true
      }
      return true
    }

    private fun commitStateLocked(b: Int, h: Int, v: Int, now: Long, force: Boolean) {
      if (!force && writeIndex != ackIndex && b == lastButtons && h == lastH && v == lastV) {
        return
      }
      lastButtons = b
      lastH = h
      lastV = v
      stateBuffer[writeIndex] = b or (h shl 8) or (v shl 16)
      stateBirthMs[writeIndex] = now
      writeIndex = (writeIndex + 1) and 0xFF
    }

    private fun buildPendingPacketLocked(now: Long): Int {
      if (!sessionActive || sessionPlayerId < 0) return 0
      if (pendingState != -1 && ((writeIndex - ackIndex) and 0xFF) < 4) {
        val p = pendingState
        pendingState = -1
        commitStateLocked(p and 0xFF, (p ushr 8) and 0xFF, (p ushr 16) and 0xFF, now, false)
      }
      val unacked = (writeIndex - ackIndex) and 0xFF
      if (unacked == 0 || unacked >= 128) return 0
      val count = unacked.coerceAtMost(11)
      val startIndex = if (unacked <= 21) ackIndex else ((writeIndex - count) and 0xFF)
      sendBuf[0] = MSG_STATE2.toByte()
      sendBuf[1] = sessionPlayerId.toByte()
      sendBuf[2] = count.toByte()
      sendBuf[3] = startIndex.toByte()
      var idx = startIndex
      for (i in 0 until count) {
        val s = stateBuffer[idx]
        val off = 4 + i * 3
        sendBuf[off] = (s and 0xFF).toByte()
        sendBuf[off + 1] = ((s ushr 8) and 0xFF).toByte()
        sendBuf[off + 2] = ((s ushr 16) and 0xFF).toByte()
        idx = (idx + 1) and 0xFF
      }
      lastSendMs = now
      return 4 + count * 3
    }

    private fun sendRawLocked(buf: ByteArray, length: Int, address: String, port: Int): Int {
      val socket = socket ?: return -1
      return try {
        val dest = if (cachedHost == address && cachedAddress != null) {
          cachedAddress!!
        } else {
          InetAddress.getByName(address).also {
            cachedHost = address
            cachedAddress = it
          }
        }
        socket.send(DatagramPacket(buf, length, dest, port))
        packetsSent.incrementAndGet()
        bytesSent.addAndGet(length)
        length
      } catch (e: Exception) {
        lastError = "send $address:$port: ${e.message}"
        -1
      }
    }

    fun sendState(buttons: Int, h: Int, v: Int): Int {
      val now = SystemClock.elapsedRealtime()
      synchronized(stateLock) {
        if (!sessionActive || sessionPlayerId < 0) return -1
        val b = buttons and 0xFF
        val hc = h and 0xFF
        val vc = v and 0xFF
        val isButtonEdge = b != lastButtons
        val isCenterRelease = hc == 128 && vc == 128 && (lastH != 128 || lastV != 128)
        val unacked = (writeIndex - ackIndex) and 0xFF
        val isKeepalive = unacked == 0 && (now - lastSendMs) >= 850L

        val sendLen = if (isButtonEdge || isCenterRelease || unacked < 4 || isKeepalive) {
          pendingState = -1
          commitStateLocked(b, hc, vc, now, isKeepalive)
          buildPendingPacketLocked(now)
        } else {
          pendingState = b or (hc shl 8) or (vc shl 16)
          if (now - lastSendMs >= 25L) buildPendingPacketLocked(now) else 0
        }
        return if (sendLen > 0) sendRawLocked(sendBuf, sendLen, sessionHost, sessionPort) else 0
      }
    }

    fun send(data: ByteArray, address: String, port: Int): Int {
      return sendRawLocked(data, data.size, address, port)
    }

    fun close() {
      receiving = false
      sessionActive = false
      releaseLock()
      releaseWifiLocks()
      socket?.close()
      socket = null
    }
    fun diagnostics(): Map<String, Any?> = mapOf(
      "socketId" to id,
      "boundPort" to (socket?.localPort ?: -1),
      "broadcast" to broadcastRequested,
      "packetsSent" to packetsSent.get(),
      "bytesSent" to bytesSent.get(),
      "packetsReceived" to packetsReceived.get(),
      "lastError" to lastError,
      "sessionActive" to sessionActive,
      "playerId" to sessionPlayerId,
      "writeIndex" to writeIndex,
      "ackIndex" to ackIndex,
      "lagMs" to smoothedLagMs,
    )

    @Suppress("DEPRECATION")
    private fun acquireWifiLocks() {
      try {
        val context = appContext.reactContext ?: return
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && lowLatencyLock == null) {
          lowLatencyLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "squadpad-ll-$id")?.apply {
            setReferenceCounted(false)
            acquire()
          }
        }
        // Many MediaTek/Samsung chipsets (such as SM-A156U) do not implement the
        // vendor IWifiChip low-latency HAL, so also hold WIFI_MODE_FULL_HIGH_PERF
        // and a MulticastLock to force wpa_supplicant `SET ps 0` (disabling 100-200ms DTIM sleep).
        if (highPerfLock == null) {
          highPerfLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "squadpad-hp-$id")?.apply {
            setReferenceCounted(false)
            acquire()
          }
        }
        if (multicastLock == null) {
          multicastLock = wifi.createMulticastLock("expo-udp-$id")?.apply {
            setReferenceCounted(false)
            acquire()
          }
        }
      } catch (_: Exception) {
      }
    }

    private fun releaseWifiLocks() {
      try {
        lowLatencyLock?.takeIf { it.isHeld }?.release()
      } catch (_: Exception) {
      }
      lowLatencyLock = null
      try {
        highPerfLock?.takeIf { it.isHeld }?.release()
      } catch (_: Exception) {
      }
      highPerfLock = null
    }

    private fun releaseLock() {
      try {
        multicastLock?.takeIf { it.isHeld }?.release()
      } catch (_: Exception) {
      }
      multicastLock = null
    }

    private fun startReceiving() {
      val socket = socket ?: return
      thread(name = "expo-udp-$id") {
        try {
          Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_DISPLAY)
        } catch (_: Exception) {
        }
        val buffer = ByteArray(2048)
        val packet = DatagramPacket(buffer, buffer.size)
        while (receiving) {
          try {
            packet.setData(buffer, 0, buffer.size)
            socket.receive(packet)
            packetsReceived.incrementAndGet()
            val len = packet.length
            if (sessionActive && len >= 2 && (buffer[0].toInt() and 0xFF) == MSG_STATE_ACK) {
              // Handle MSG_STATE_ACK directly on the native thread in microseconds
              val now = SystemClock.elapsedRealtime()
              val ackNext = buffer[1].toInt() and 0xFF
              var emitLag = -1
              synchronized(stateLock) {
                val unacked = (writeIndex - ackIndex) and 0xFF
                val stateDiff = (ackNext - ackIndex) and 0xFF
                if (stateDiff in 1..unacked) {
                  val birth = stateBirthMs[(ackNext - 1) and 0xFF]
                  if (birth > 0L) {
                    val halfRtt = (((now - birth) + 1L) / 2L).toInt().coerceAtLeast(1)
                    smoothedLagMs = if (smoothedLagMs == 0) halfRtt else ((smoothedLagMs * 2 + halfRtt) / 3).coerceAtLeast(1)
                  }
                  ackIndex = ackNext
                  if (pendingState != -1 && ((writeIndex - ackIndex) and 0xFF) < 4) {
                    val p = pendingState
                    pendingState = -1
                    commitStateLocked(p and 0xFF, (p ushr 8) and 0xFF, (p ushr 16) and 0xFF, now, false)
                    val sendLen = buildPendingPacketLocked(now)
                    if (sendLen > 0) sendRawLocked(sendBuf, sendLen, sessionHost, sessionPort)
                  }
                } else if (stateDiff > unacked && ((ackIndex - ackNext) and 0xFF) > 16) {
                  val p = pendingState
                  pendingState = -1
                  val b = if (p != -1) (p and 0xFF) else lastButtons
                  val hc = if (p != -1) ((p ushr 8) and 0xFF) else lastH
                  val vc = if (p != -1) ((p ushr 16) and 0xFF) else lastV
                  ackIndex = ackNext
                  writeIndex = ackNext
                  commitStateLocked(b, hc, vc, now, true)
                  val sendLen = buildPendingPacketLocked(now)
                  if (sendLen > 0) sendRawLocked(sendBuf, sendLen, sessionHost, sessionPort)
                }
                if (now - lastAckEmitMs >= 400L) {
                  lastAckEmitMs = now
                  emitLag = if (smoothedLagMs > 0) smoothedLagMs else 1
                }
              }
              if (emitLag > 0) {
                onMessage(byteArrayOf(MSG_STATE_ACK.toByte(), ackNext.toByte()), "", packet.port, emitLag)
              }
            } else {
              onMessage(buffer.copyOf(len), packet.address?.hostAddress ?: "", packet.port, 0)
            }
          } catch (e: SocketTimeoutException) {
            if (sessionActive) {
              val now = SystemClock.elapsedRealtime()
              synchronized(stateLock) {
                if (pendingState != -1 && ((writeIndex - ackIndex) and 0xFF) < 4) {
                  val p = pendingState
                  pendingState = -1
                  commitStateLocked(p and 0xFF, (p ushr 8) and 0xFF, (p ushr 16) and 0xFF, now, false)
                }
                val unacked = (writeIndex - ackIndex) and 0xFF
                if (unacked in 1..127 && (now - lastSendMs) >= 35L) {
                  val sendLen = buildPendingPacketLocked(now)
                  if (sendLen > 0) sendRawLocked(sendBuf, sendLen, sessionHost, sessionPort)
                }
              }
            }
            continue
          } catch (e: Exception) {
            if (receiving) lastError = "receive: ${e.message}"
            break
          }
        }
      }
    }
  }
}

private const val RECEIVE_TIMEOUT_MS = 35

/** BombSquad remote protocol opcodes; mirrors native/src/protocol/constants.ts. */
private const val MSG_STATE2 = 10
private const val MSG_STATE_ACK = 6
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
