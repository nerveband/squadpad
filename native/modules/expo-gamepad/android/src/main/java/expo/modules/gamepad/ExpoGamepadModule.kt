package expo.modules.gamepad

import android.content.Context
import android.hardware.input.InputManager
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGamepadModule : Module() {
  private var inputManager: InputManager? = null
  private val knownDevices = mutableMapOf<Int, Map<String, String>>()

  private val deviceListener = object : InputManager.InputDeviceListener {
    override fun onInputDeviceAdded(deviceId: Int) {
      val info = describe(InputDevice.getDevice(deviceId)) ?: return
      knownDevices[deviceId] = info
      sendEvent("onControllerConnected", info)
    }

    override fun onInputDeviceRemoved(deviceId: Int) {
      val info = knownDevices.remove(deviceId) ?: return
      if (knownDevices.isEmpty()) GamepadInput.reset()
      sendEvent("onControllerDisconnected", mapOf("id" to info.getValue("id")))
    }

    override fun onInputDeviceChanged(deviceId: Int) = Unit
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoGamepad")

    Events("onControllerConnected", "onControllerDisconnected", "onGamepadInput")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      inputManager = (context.getSystemService(Context.INPUT_SERVICE) as? InputManager)?.also {
        it.registerInputDeviceListener(deviceListener, Handler(Looper.getMainLooper()))
      }
      InputDevice.getDeviceIds().forEach { id ->
        describe(InputDevice.getDevice(id))?.let { knownDevices[id] = it }
      }
    }

    OnStartObserving("onGamepadInput") {
      GamepadInput.sink = { snapshot -> sendEvent("onGamepadInput", snapshot) }
    }

    OnStopObserving("onGamepadInput") {
      GamepadInput.sink = null
      GamepadInput.reset()
    }

    OnDestroy {
      GamepadInput.sink = null
      inputManager?.unregisterInputDeviceListener(deviceListener)
      inputManager = null
    }

    Function("getConnectedControllers") { ->
      InputDevice.getDeviceIds().toList().mapNotNull { id -> describe(InputDevice.getDevice(id)) }
    }
  }

  private fun describe(device: InputDevice?): Map<String, String>? {
    if (device == null || device.isVirtual || !GamepadInput.isGamepad(device)) return null
    return mapOf(
      "id" to device.descriptor,
      "name" to device.name,
      "vendorName" to device.name,
    )
  }
}
