import ExpoModulesCore
import GameController

public class ExpoGamepadModule: Module {
  private var pollTimer: Timer?

  public func definition() -> ModuleDefinition {
    Name("ExpoGamepad")

    Events("onControllerConnected", "onControllerDisconnected", "onGamepadInput")

    OnCreate {
      NotificationCenter.default.addObserver(
        forName: .GCControllerDidConnect,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let controller = notification.object as? GCController else { return }
        self?.handleConnect(controller)
      }

      NotificationCenter.default.addObserver(
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
      self?.sendEvent("onGamepadInput", [
        "leftStickX": gamepad.leftThumbstick.xAxis.value,
        // GameController reports up as +1; the app uses screen orientation (down = +1).
        "leftStickY": -gamepad.leftThumbstick.yAxis.value,
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
