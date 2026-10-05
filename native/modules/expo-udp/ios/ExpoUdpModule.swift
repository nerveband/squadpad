import Darwin
import ExpoModulesCore

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

      let socket = try UdpSocket(id: id, port: UInt16(clamping: port)) { [weak self] data, address, remotePort in
        self?.sendEvent("onUdpMessage", [
          "socketId": id,
          "data": [UInt8](data),
          "address": address,
          "port": remotePort,
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
  private let onMessage: (Data, String, Int) -> Void
  private let stats = NSLock()
  private var broadcast = false
  private var packetsSent = 0
  private var bytesSent = 0
  private var packetsReceived = 0
  private var lastError: String?

  init(id: Int, port: UInt16, onMessage: @escaping (Data, String, Int) -> Void) throws {
    self.id = id
    self.onMessage = onMessage

    let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    guard fd >= 0 else { throw UdpError.posix("socket", errno) }

    var yes: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size))

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
    self.source = DispatchSource.makeReadSource(
      fileDescriptor: fd,
      queue: DispatchQueue(label: "expo.udp.socket.\(id)")
    )
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

  func send(_ data: [UInt8], to address: String, port: UInt16) -> Int {
    guard var dest = resolveIPv4(address) else {
      record(error: "cannot resolve \(address)")
      return -Int(EHOSTUNREACH)
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
    ]
  }

  private func drain() {
    var buffer = [UInt8](repeating: 0, count: 2048)
    while true {
      var from = sockaddr_in()
      var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
      let count = buffer.withUnsafeMutableBytes { raw in
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
      stats.lock()
      packetsReceived += 1
      stats.unlock()
      onMessage(Data(buffer[0..<count]), ipString(from.sin_addr), Int(UInt16(bigEndian: from.sin_port)))
    }
  }

  private func record(error: String) {
    stats.lock()
    lastError = error
    stats.unlock()
  }
}

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
