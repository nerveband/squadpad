package expo.modules.gamepad

import android.app.Activity
import android.content.Context
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.Window
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Android only delivers controller input to the focused window, so wrap the
 * activity's Window.Callback and offer gamepad events to [GamepadInput] first.
 */
class ExpoGamepadPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        val window = activity.window
        if (window.callback !is GamepadWindowCallback) {
          window.callback = GamepadWindowCallback(window.callback)
        }
      }
    })
}

private class GamepadWindowCallback(private val base: Window.Callback) : Window.Callback by base {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
    GamepadInput.onKeyEvent(event) || base.dispatchKeyEvent(event)

  override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean =
    GamepadInput.onMotionEvent(event) || base.dispatchGenericMotionEvent(event)
}
