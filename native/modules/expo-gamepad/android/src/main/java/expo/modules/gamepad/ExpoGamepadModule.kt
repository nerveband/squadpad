package expo.modules.gamepad

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGamepadModule : Module() {
  private var lastLeftX = 0f
  private var lastLeftY = 0f

  override fun definition() = ModuleDefinition {
    Name("ExpoGamepad")

    Events("onControllerConnected", "onControllerDisconnected", "onGamepadInput")

    Function("getConnectedControllers") {
      val devices = InputDevice.getDeviceIds()
        .mapNotNull { InputDevice.getDevice(it) }
        .filter { it.sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD }
        .map { device ->
          mapOf(
            "id" to device.descriptor,
            "name" to device.name,
            "vendorName" to (device.name ?: "Unknown"),
          )
        }
      devices
    }
  }

  fun handleMotionEvent(event: MotionEvent): Boolean {
    if (event.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK) {
      return false
    }

    val leftX = event.getAxisValue(MotionEvent.AXIS_X)
    val leftY = event.getAxisValue(MotionEvent.AXIS_Y)

    if (leftX != lastLeftX || leftY != lastLeftY) {
      lastLeftX = leftX
      lastLeftY = leftY

      sendEvent("onGamepadInput", mapOf(
        "leftStickX" to leftX,
        "leftStickY" to leftY,
        "buttonA" to false,
        "buttonB" to false,
        "buttonX" to false,
        "buttonY" to false,
        "leftTrigger" to event.getAxisValue(MotionEvent.AXIS_LTRIGGER),
        "rightTrigger" to event.getAxisValue(MotionEvent.AXIS_RTRIGGER),
      ))
    }
    return true
  }

  fun handleKeyEvent(event: KeyEvent): Boolean {
    if (event.source and InputDevice.SOURCE_GAMEPAD != InputDevice.SOURCE_GAMEPAD) {
      return false
    }

    val isPressed = event.action == KeyEvent.ACTION_DOWN
    val buttonA = event.keyCode == KeyEvent.KEYCODE_BUTTON_A && isPressed
    val buttonB = event.keyCode == KeyEvent.KEYCODE_BUTTON_B && isPressed
    val buttonX = event.keyCode == KeyEvent.KEYCODE_BUTTON_X && isPressed
    val buttonY = event.keyCode == KeyEvent.KEYCODE_BUTTON_Y && isPressed

    sendEvent("onGamepadInput", mapOf(
      "leftStickX" to lastLeftX,
      "leftStickY" to lastLeftY,
      "buttonA" to buttonA,
      "buttonB" to buttonB,
      "buttonX" to buttonX,
      "buttonY" to buttonY,
      "leftTrigger" to 0f,
      "rightTrigger" to 0f,
    ))
    return true
  }
}
