package expo.modules.gamepad

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import kotlin.math.abs

/**
 * Tracks the full controller state across separate key and motion events and
 * forwards snapshots to the active module. Events are consumed only while a
 * module is listening, so the app behaves normally without the JS hook.
 */
internal object GamepadInput {
  @Volatile var sink: ((Map<String, Any>) -> Unit)? = null

  private var stickX = 0f
  private var stickY = 0f
  private var hatX = 0f
  private var hatY = 0f
  private var leftTrigger = 0f
  private var rightTrigger = 0f
  private val pressed = mutableSetOf<Int>()

  fun isGamepad(device: InputDevice?): Boolean {
    val sources = device?.sources ?: return false
    return sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
      sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
  }

  fun onKeyEvent(event: KeyEvent): Boolean {
    val sink = sink ?: return false
    if (event.source and InputDevice.SOURCE_GAMEPAD != InputDevice.SOURCE_GAMEPAD &&
      event.source and InputDevice.SOURCE_DPAD != InputDevice.SOURCE_DPAD) return false
    if (event.keyCode !in HANDLED_KEYS) return false

    when (event.action) {
      KeyEvent.ACTION_DOWN -> if (!pressed.add(event.keyCode)) return true // ignore auto-repeat
      KeyEvent.ACTION_UP -> pressed.remove(event.keyCode)
      else -> return true
    }
    sink(snapshot())
    return true
  }

  fun onMotionEvent(event: MotionEvent): Boolean {
    val sink = sink ?: return false
    if (event.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK ||
      event.action != MotionEvent.ACTION_MOVE) return false

    val device = event.device
    stickX = centered(event, device, MotionEvent.AXIS_X)
    stickY = centered(event, device, MotionEvent.AXIS_Y)
    hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X)
    hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
    leftTrigger = maxOf(event.getAxisValue(MotionEvent.AXIS_LTRIGGER), event.getAxisValue(MotionEvent.AXIS_BRAKE))
    rightTrigger = maxOf(event.getAxisValue(MotionEvent.AXIS_RTRIGGER), event.getAxisValue(MotionEvent.AXIS_GAS))
    sink(snapshot())
    return true
  }

  fun reset() {
    stickX = 0f; stickY = 0f; hatX = 0f; hatY = 0f
    leftTrigger = 0f; rightTrigger = 0f
    pressed.clear()
  }

  // Y is screen-oriented (down = +1), matching the on-screen joystick.
  private fun snapshot(): Map<String, Any> {
    var x = stickX
    var y = stickY
    if (x == 0f && y == 0f) {
      x = if (hatX != 0f) hatX else dpad(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)
      y = if (hatY != 0f) hatY else dpad(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN)
    }
    return mapOf(
      "leftStickX" to x,
      "leftStickY" to y,
      "buttonA" to (KeyEvent.KEYCODE_BUTTON_A in pressed),
      "buttonB" to (KeyEvent.KEYCODE_BUTTON_B in pressed),
      "buttonX" to (KeyEvent.KEYCODE_BUTTON_X in pressed),
      "buttonY" to (KeyEvent.KEYCODE_BUTTON_Y in pressed),
      "leftTrigger" to maxOf(leftTrigger, if (KeyEvent.KEYCODE_BUTTON_L2 in pressed) 1f else 0f),
      "rightTrigger" to maxOf(rightTrigger, if (KeyEvent.KEYCODE_BUTTON_R2 in pressed) 1f else 0f),
    )
  }

  private fun dpad(negative: Int, positive: Int): Float =
    (if (positive in pressed) 1f else 0f) - (if (negative in pressed) 1f else 0f)

  private fun centered(event: MotionEvent, device: InputDevice?, axis: Int): Float {
    val value = event.getAxisValue(axis)
    val flat = device?.getMotionRange(axis, event.source)?.flat ?: 0f
    return if (abs(value) > flat) value else 0f
  }

  private val HANDLED_KEYS = setOf(
    KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B,
    KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_BUTTON_Y,
    KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2,
    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
  )
}
