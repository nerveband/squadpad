import ExpoModulesCore
import GameController

public class ExpoGamepadModule: Module {
  private var pollTimer: Timer?
  private var connectObserver: NSObjectProtocol?
  private var disconnectObserver: NSObjectProtocol?
  public func definition() -> ModuleDefinition {
    Name("ExpoGamepad")

    Events("onControllerConnected", "onControllerDisconnected", "onGamepadInput")

    OnCreate {
      self.connectObserver = NotificationCenter.default.addObserver(
        forName: .GCControllerDidConnect,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let controller = notification.object as? GCController else { return }
        self?.handleConnect(controller)
      }

      self.disconnectObserver = NotificationCenter.default.addObserver(
        forName: .GCControllerDidDisconnect,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let controller = notification.object as? GCController else { return }
        self?.sendEvent("onControllerDisconnected", [
          "id": controller.vendorName ?? "unknown"
        ])
      }
      GCController.controllers().forEach { self.handleConnect($0) }
      GCController.startWirelessControllerDiscovery {}
    }

    OnDestroy {
      if let obs = self.connectObserver {
        NotificationCenter.default.removeObserver(obs)
        self.connectObserver = nil
      }
      if let obs = self.disconnectObserver {
        NotificationCenter.default.removeObserver(obs)
        self.disconnectObserver = nil
      }
      GCController.controllers().forEach { $0.extendedGamepad?.valueChangedHandler = nil }
      GCController.stopWirelessControllerDiscovery()
      self.pollTimer?.invalidate()
    }
    Function("getConnectedControllers") { () -> [[String: String]] in
      GCController.controllers().map { controller in
        [
          "id": controller.vendorName ?? "unknown",
          "name": controller.vendorName ?? "Game Controller",
          "vendorName": controller.vendorName ?? "",
        ]
      }
    }
  }

  private func handleConnect(_ controller: GCController) {
    sendEvent("onControllerConnected", [
      "id": controller.vendorName ?? "unknown",
      "name": controller.vendorName ?? "Game Controller",
      "vendorName": controller.vendorName ?? "",
    ])

    // Set up input handler
    controller.extendedGamepad?.valueChangedHandler = { [weak self] gamepad, element in
      let thumbX = gamepad.leftThumbstick.xAxis.value
      let thumbY = gamepad.leftThumbstick.yAxis.value
      let stickX = abs(thumbX) > 0.05 ? thumbX : gamepad.dpad.xAxis.value
      let stickY = abs(thumbY) > 0.05 ? thumbY : gamepad.dpad.yAxis.value
      self?.sendEvent("onGamepadInput", [
        "leftStickX": stickX,
        // GameController reports up as +1; the app uses screen orientation (down = +1).
        "leftStickY": -stickY,
        "buttonA": gamepad.buttonA.isPressed,
        "buttonB": gamepad.buttonB.isPressed,
        "buttonX": gamepad.buttonX.isPressed,
        "buttonY": gamepad.buttonY.isPressed,
        "leftTrigger": gamepad.leftTrigger.value,
        "rightTrigger": gamepad.rightTrigger.value,
      ])
    }
  }
}
