import Darwin
import ExpoModulesCore
import UIKit
public class ExpoUdpModule: Module {
  private var sockets: [Int: UdpSocket] = [:]
  private var nextId = 1
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("ExpoUdp")

    Events("onUdpMessage")

    AsyncFunction("createSocket") { (port: Int) -> Int in
      self.lock.lock()
      let id = self.nextId
      self.nextId += 1
      self.lock.unlock()

      let socket = try UdpSocket(id: id, port: UInt16(clamping: port)) { [weak self] data, address, remotePort, lagMs in
        self?.sendEvent("onUdpMessage", [
          "socketId": id,
          "data": [UInt8](data),
          "address": address,
          "port": remotePort,
          "lagMs": lagMs,
        ])
      }
      self.lock.lock()
      self.sockets[id] = socket
      self.lock.unlock()
      return id
    }

    Function("setBroadcast") { (socketId: Int, enabled: Bool) in
      self.socket(socketId)?.setBroadcast(enabled)
    }
    Function("configureSession") { (socketId: Int, playerId: Int, address: String, port: Int) -> Bool in
      guard let socket = self.socket(socketId) else { return false }
      return socket.configureSession(playerId: playerId, address: address, port: UInt16(clamping: port))
    }

    Function("sendState") { (socketId: Int, buttons: Int, h: Int, v: Int) -> Int in
      guard let socket = self.socket(socketId) else { return -Int(EBADF) }
      return socket.sendState(buttons: buttons, h: h, v: v)
    }

    // Returns bytes sent, or a negative errno on failure.
    Function("send") { (socketId: Int, data: [UInt8], address: String, port: Int) -> Int in
      guard let socket = self.socket(socketId) else { return -Int(EBADF) }
      return socket.send(data, to: address, port: UInt16(clamping: port))
    }

    Function("closeSocket") { (socketId: Int) in
      self.lock.lock()
      let socket = self.sockets.removeValue(forKey: socketId)
      self.lock.unlock()
      socket?.close()
    }

    Function("diagnostics") { (socketId: Int) -> [String: Any] in
      guard let socket = self.socket(socketId) else { return ["error": "unknown socket \(socketId)"] }
      return socket.diagnostics()
    }

    Function("getBroadcastAddress") { () -> String? in
      return broadcastAddress()
    }

    Function("copyToClipboard") { (text: String) -> Bool in
      UIPasteboard.general.string = text
      return true
    }
    OnDestroy {
      self.lock.lock()
      let all = Array(self.sockets.values)
      self.sockets.removeAll()
      self.lock.unlock()
      all.forEach { $0.close() }
    }
  }

  private func socket(_ id: Int) -> UdpSocket? {
    lock.lock()
    defer { lock.unlock() }
    return sockets[id]
  }
}

/// One bound UDP socket used for both sending and receiving, so replies
/// arrive on the same port the request was sent from.
private final class UdpSocket {
  let id: Int
  private let fd: Int32
  private let source: DispatchSourceRead
  private let resendTimer: DispatchSourceTimer
  private let queue: DispatchQueue
  private let onMessage: (Data, String, Int, Int) -> Void
  private let stats = NSLock()
  private var broadcast = false
  private var packetsSent = 0
  private var bytesSent = 0
  private var packetsReceived = 0
  private var lastError: String?
  private var cachedHost: String?
  private var cachedAddr: sockaddr_in?
  private var recvBuffer = [UInt8](repeating: 0, count: 2048)

  private var sessionActive = false
  private var sessionPlayerId = -1
  private var sessionHost = ""
  private var sessionPort: UInt16 = 43210
  private var stateBuffer = [Int](repeating: 0, count: 256)
  private var stateBirthMs = [Int64](repeating: 0, count: 256)
  private var writeIndex = 0
  private var ackIndex = 0
  private var lastButtons = 0
  private var lastH = 128
  private var lastV = 128
  private var pendingState = -1
  private var lastSendMs: Int64 = 0
  private var lastAckEmitMs: Int64 = 0
  private var smoothedLagMs = 0
  private var sendBuf = [UInt8](repeating: 0, count: 40)

  init(id: Int, port: UInt16, onMessage: @escaping (Data, String, Int, Int) -> Void) throws {
    self.id = id
    self.onMessage = onMessage

    let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    guard fd >= 0 else { throw UdpError.posix("socket", errno) }

    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size))
    var netServiceVo: Int32 = NET_SERVICE_TYPE_VO
    setsockopt(fd, SOL_SOCKET, SO_NET_SERVICE_TYPE, &netServiceVo, socklen_t(MemoryLayout<Int32>.size))
    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = port.bigEndian
    addr.sin_addr.s_addr = INADDR_ANY
    let bound = withUnsafePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0 else {
      let err = errno
      Darwin.close(fd)
      throw UdpError.posix("bind", err)
    }

    _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)

    self.fd = fd
    let q = DispatchQueue(label: "expo.udp.socket.\(id)", qos: .userInteractive)
    self.queue = q
    self.source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: q)
    self.resendTimer = DispatchSource.makeTimerSource(queue: q)
    resendTimer.schedule(deadline: .now() + .milliseconds(35), repeating: .milliseconds(35))
    resendTimer.setEventHandler { [weak self] in self?.tickResend() }
    resendTimer.resume()
    source.setEventHandler { [weak self] in self?.drain() }
    source.setCancelHandler { Darwin.close(fd) }
    source.resume()
  }

  func setBroadcast(_ enabled: Bool) {
    var value: Int32 = enabled ? 1 : 0
    if setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &value, socklen_t(MemoryLayout<Int32>.size)) == 0 {
      stats.lock()
      broadcast = enabled
      stats.unlock()
    } else {
      record(error: "setsockopt(SO_BROADCAST): \(String(cString: strerror(errno)))")
    }
  }
  private static func nowMs() -> Int64 {
    return Int64(ProcessInfo.processInfo.systemUptime * 1000.0)
  }

  func configureSession(playerId: Int, address: String, port: UInt16) -> Bool {
    let resolved = resolveIPv4(address)
    stats.lock()
    if let r = resolved {
      cachedHost = address
      cachedAddr = r
    }
    sessionPlayerId = playerId & 0xFF
    sessionHost = address
    sessionPort = port
    writeIndex = 0
    ackIndex = 0
    lastButtons = 0
    lastH = 128
    lastV = 128
    pendingState = -1
    lastSendMs = 0
    lastAckEmitMs = 0
    smoothedLagMs = 0
    sessionActive = true
    stats.unlock()
    return true
  }

  private func commitStateLocked(b: Int, h: Int, v: Int, now: Int64, force: Bool) {
    if !force && writeIndex != ackIndex && b == lastButtons && h == lastH && v == lastV {
      return
    }
    lastButtons = b
    lastH = h
    lastV = v
    stateBuffer[writeIndex] = b | (h << 8) | (v << 16)
    stateBirthMs[writeIndex] = now
    writeIndex = (writeIndex + 1) & 0xFF
  }

  private func buildPendingPacketLocked(now: Int64) -> Int {
    if !sessionActive || sessionPlayerId < 0 { return 0 }
    if pendingState != -1 && ((writeIndex - ackIndex) & 0xFF) < 4 {
      let p = pendingState
      pendingState = -1
      commitStateLocked(b: p & 0xFF, h: (p >> 8) & 0xFF, v: (p >> 16) & 0xFF, now: now, force: false)
    }
    let unacked = (writeIndex - ackIndex) & 0xFF
    if unacked == 0 || unacked >= 128 { return 0 }
    let count = min(unacked, 11)
    let startIndex = unacked <= 21 ? ackIndex : ((writeIndex - count) & 0xFF)
    sendBuf[0] = UInt8(msgState2)
    sendBuf[1] = UInt8(sessionPlayerId & 0xFF)
    sendBuf[2] = UInt8(count)
    sendBuf[3] = UInt8(startIndex)
    var idx = startIndex
    for i in 0..<count {
      let s = stateBuffer[idx]
      let off = 4 + i * 3
      sendBuf[off] = UInt8(s & 0xFF)
      sendBuf[off + 1] = UInt8((s >> 8) & 0xFF)
      sendBuf[off + 2] = UInt8((s >> 16) & 0xFF)
      idx = (idx + 1) & 0xFF
    }
    lastSendMs = now
    return 4 + count * 3
  }

  private func sendRawLocked(count: Int, address: String, port: UInt16) -> Int {
    guard var dest = cachedAddr else { return -Int(EHOSTUNREACH) }
    dest.sin_port = port.bigEndian
    let sent = sendBuf.withUnsafeBytes { buffer in
      withUnsafePointer(to: &dest) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          sendto(fd, buffer.baseAddress, count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
    if sent >= 0 {
      packetsSent += 1
      bytesSent += sent
    }
    return sent
  }

  /// A 128-or-more gap means the sequence window wrapped: the host stopped
  /// acknowledging, so every later packet would look like a duplicate and be
  /// dropped. Restart the ring at zero and re-commit the live state.
  private func recoverStallLocked(now: Int64) {
    ackIndex = 0
    writeIndex = 0
    pendingState = -1
    commitStateLocked(b: lastButtons, h: lastH, v: lastV, now: now, force: true)
  }

  func sendState(buttons: Int, h: Int, v: Int) -> Int {
    let now = Self.nowMs()
    stats.lock()
    if !sessionActive || sessionPlayerId < 0 {
      stats.unlock()
      return -Int(EINVAL)
    }
    let b = buttons & 0xFF
    let hc = h & 0xFF
    let vc = v & 0xFF
    let isButtonEdge = b != lastButtons
    let isCenterRelease = hc == 128 && vc == 128 && (lastH != 128 || lastV != 128)
    if ((writeIndex - ackIndex) & 0xFF) >= 128 {
      recoverStallLocked(now: now)
    }
    let unacked = (writeIndex - ackIndex) & 0xFF
    let isKeepalive = unacked == 0 && (now - lastSendMs) >= 850
    let sendLen: Int
    if isButtonEdge || isCenterRelease || unacked < 4 || isKeepalive {
      pendingState = -1
      commitStateLocked(b: b, h: hc, v: vc, now: now, force: isKeepalive)
      sendLen = buildPendingPacketLocked(now: now)
    } else {
      pendingState = b | (hc << 8) | (vc << 16)
      sendLen = (now - lastSendMs) >= 25 ? buildPendingPacketLocked(now: now) : 0
    }
    let res = sendLen > 0 ? sendRawLocked(count: sendLen, address: sessionHost, port: sessionPort) : 0
    stats.unlock()
    return res
  }

  private func tickResend() {
    let now = Self.nowMs()
    stats.lock()
    if sessionActive && sessionPlayerId >= 0 {
      if pendingState != -1 && ((writeIndex - ackIndex) & 0xFF) < 4 {
        let p = pendingState
        pendingState = -1
        commitStateLocked(b: p & 0xFF, h: (p >> 8) & 0xFF, v: (p >> 16) & 0xFF, now: now, force: false)
      }
      let unacked = (writeIndex - ackIndex) & 0xFF
      if unacked > 0 && unacked < 128 && (now - lastSendMs) >= 35 {
        let sendLen = buildPendingPacketLocked(now: now)
        if sendLen > 0 {
          _ = sendRawLocked(count: sendLen, address: sessionHost, port: sessionPort)
        }
      }
    }
    stats.unlock()
  }

  func send(_ data: [UInt8], to address: String, port: UInt16) -> Int {
    var dest: sockaddr_in
    stats.lock()
    if cachedHost == address, let cached = cachedAddr {
      dest = cached
      stats.unlock()
    } else {
      stats.unlock()
      guard let resolved = resolveIPv4(address) else {
        record(error: "cannot resolve \(address)")
        return -Int(EHOSTUNREACH)
      }
      stats.lock()
      cachedHost = address
      cachedAddr = resolved
      stats.unlock()
      dest = resolved
    }
    dest.sin_port = port.bigEndian
    let sent = data.withUnsafeBytes { buffer in
      withUnsafePointer(to: &dest) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          sendto(fd, buffer.baseAddress, buffer.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
    if sent < 0 {
      let err = errno
      record(error: "sendto \(address):\(port): \(String(cString: strerror(err)))")
      return -Int(err)
    }
    stats.lock()
    packetsSent += 1
    bytesSent += sent
    stats.unlock()
    return sent
  }

  func close() {
    stats.lock()
    sessionActive = false
    stats.unlock()
    resendTimer.cancel()
    source.cancel()
  }

  func diagnostics() -> [String: Any] {
    var addr = sockaddr_in()
    var len = socklen_t(MemoryLayout<sockaddr_in>.size)
    let boundPort = withUnsafeMutablePointer(to: &addr) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) }
    } == 0 ? Int(UInt16(bigEndian: addr.sin_port)) : -1

    stats.lock()
    defer { stats.unlock() }
    return [
      "socketId": id,
      "boundPort": boundPort,
      "broadcast": broadcast,
      "packetsSent": packetsSent,
      "bytesSent": bytesSent,
      "packetsReceived": packetsReceived,
      "lastError": lastError as Any,
      "sessionActive": sessionActive,
      "playerId": sessionPlayerId,
      "writeIndex": writeIndex,
      "ackIndex": ackIndex,
      "lagMs": smoothedLagMs,
    ]
  }

  private func drain() {
    while true {
      var from = sockaddr_in()
      var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
      let count = recvBuffer.withUnsafeMutableBytes { raw in
        withUnsafeMutablePointer(to: &from) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            recvfrom(fd, raw.baseAddress, raw.count, 0, $0, &fromLen)
          }
        }
      }
      if count < 0 {
        if errno != EAGAIN && errno != EWOULDBLOCK {
          record(error: "recvfrom: \(String(cString: strerror(errno)))")
        }
        return
      }
      if count == 0 { continue }
      let now = Self.nowMs()
      stats.lock()
      packetsReceived += 1
      if sessionActive && count >= 2 && recvBuffer[0] == UInt8(msgStateAck) {
        let ackNext = Int(recvBuffer[1])
        let unacked = (writeIndex - ackIndex) & 0xFF
        let stateDiff = (ackNext - ackIndex) & 0xFF
        if stateDiff > 0 && stateDiff <= unacked {
          let birth = stateBirthMs[(ackNext - 1) & 0xFF]
          if birth > 0 {
            let halfRtt = max(1, Int((now - birth + 1) / 2))
            smoothedLagMs = smoothedLagMs == 0 ? halfRtt : max(1, (smoothedLagMs * 2 + halfRtt) / 3)
          }
          ackIndex = ackNext
          if pendingState != -1 && ((writeIndex - ackIndex) & 0xFF) < 4 {
            let p = pendingState
            pendingState = -1
            commitStateLocked(b: p & 0xFF, h: (p >> 8) & 0xFF, v: (p >> 16) & 0xFF, now: now, force: false)
            let sendLen = buildPendingPacketLocked(now: now)
            if sendLen > 0 {
              _ = sendRawLocked(count: sendLen, address: sessionHost, port: sessionPort)
            }
          }
        } else if stateDiff > unacked && ((ackIndex - ackNext) & 0xFF) > 16 {
          let p = pendingState
          pendingState = -1
          let b = p != -1 ? (p & 0xFF) : lastButtons
          let hc = p != -1 ? ((p >> 8) & 0xFF) : lastH
          let vc = p != -1 ? ((p >> 16) & 0xFF) : lastV
          ackIndex = ackNext
          writeIndex = ackNext
          commitStateLocked(b: b, h: hc, v: vc, now: now, force: true)
          let sendLen = buildPendingPacketLocked(now: now)
          if sendLen > 0 {
            _ = sendRawLocked(count: sendLen, address: sessionHost, port: sessionPort)
          }
        }
        var emitLag = -1
        if (now - lastAckEmitMs) >= 400 {
          lastAckEmitMs = now
          emitLag = smoothedLagMs > 0 ? smoothedLagMs : 1
        }
        stats.unlock()
        if emitLag > 0 {
          onMessage(Data([UInt8(msgStateAck), UInt8(ackNext & 0xFF)]), "", Int(UInt16(bigEndian: from.sin_port)), emitLag)
        }
      } else {
        stats.unlock()
        onMessage(Data(recvBuffer[0..<count]), ipString(from.sin_addr), Int(UInt16(bigEndian: from.sin_port)), 0)
      }
    }
  }
  private func record(error: String) {
    stats.lock()
    lastError = error
    stats.unlock()
  }
}

/// BombSquad remote protocol opcodes; mirrors native/src/protocol/constants.ts.
private let msgState2 = 10
private let msgStateAck = 6

private enum UdpError: Error, CustomStringConvertible {
  case posix(String, Int32)

  var description: String {
    switch self {
    case let .posix(call, code): return "\(call) failed: \(String(cString: strerror(code)))"
    }
  }
}

private func resolveIPv4(_ host: String) -> sockaddr_in? {
  var addr = sockaddr_in()
  addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
  addr.sin_family = sa_family_t(AF_INET)
  if inet_pton(AF_INET, host, &addr.sin_addr) == 1 { return addr }

  var hints = addrinfo()
  hints.ai_family = AF_INET
  hints.ai_socktype = SOCK_DGRAM
  var result: UnsafeMutablePointer<addrinfo>?
  guard getaddrinfo(host, nil, &hints, &result) == 0, let info = result else { return nil }
  defer { freeaddrinfo(result) }
  info.pointee.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
    addr.sin_addr = $0.pointee.sin_addr
  }
  return addr
}

private func ipString(_ address: in_addr) -> String {
  var address = address
  var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
  inet_ntop(AF_INET, &address, &buffer, socklen_t(INET_ADDRSTRLEN))
  return String(cString: buffer)
}

/// Subnet broadcast address of the Wi-Fi interface (en0), falling back to any
/// other active IPv4 interface. iOS rejects 255.255.255.255 with EHOSTUNREACH.
private func broadcastAddress() -> String? {
  var list: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&list) == 0 else { return nil }
  defer { freeifaddrs(list) }

  var fallback: String?
  var cursor = list
  while let ifa = cursor?.pointee {
    defer { cursor = ifa.ifa_next }
    let flags = Int32(ifa.ifa_flags)
    guard let addr = ifa.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET),
          flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0, flags & IFF_BROADCAST != 0,
          let dst = ifa.ifa_dstaddr else { continue }
    let broadcast = dst.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { ipString($0.pointee.sin_addr) }
    if String(cString: ifa.ifa_name) == "en0" { return broadcast }
    if fallback == nil { fallback = broadcast }
  }
  return fallback
}
