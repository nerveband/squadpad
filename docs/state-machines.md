# Implicit state machines found and fixed

|Surface|Implicit state before|Bug it hid|Explicit state now|
|---|---|---|---|
|`native/src/connection/udp-connection.ts` session|`connected: boolean` + `nativeSession: boolean`|No way to tell handshaking from failed; `fail()` left the object looking alive|`phase: idle / handshaking / active / failed`, `connected` derived|
|`native/src/connection/udp-connection.ts` sequence window|`writeIndex`/`ackIndex` free-running bytes|Window wrap at 128 unacked silently sent nothing forever|Wrap detected, ring restarted, live state re-committed|
|`ExpoUdpModule.kt` sequence window|same, native|same stall, no telemetry|`recoverStallLocked()` + phase/indices in diagnostics|
|`ExpoUdpModule.swift` sequence window|same, native|same stall|`recoverStallLocked()` + phase/indices in diagnostics|
|`native/src/controller/controller-state.ts` neutral state|dedupe cache doubled as "neutral reached"|`reset()` emitted nothing when cache already neutral, so a host holding a button was never told|`reset()` clears the cache and force-emits neutral|
|`native/src/controller/controller-state.ts` run bit|four booleans OR'd ad hoc|No single place guaranteed every source is cleared|`reset()` clears all four sources; test pins it|
|`native/src/components/Joystick.tsx` touch ownership|`activeTouchId`/`isActive`/hysteresis values|Dropped touch-up on Android left the stick owning a dead id, so all later thumbs were ignored|`resetSignal` forces the idle transition|
|`native/src/components/ActionButtons.tsx` touch table|`touchIds`/`touchMasks`/`currentMask`|Dropped touch-up left a phantom held chord|`resetSignal` clears the table and releases the chord|
|`native/app/controller.tsx` input session|`controller.resetController()` alone|Reset did not reach either touch state machine|`inputEpoch` bumped on background and on opening settings|
|`native/app/settings.tsx` toasts|bare `setTimeout` per flag|Timer could fire after unmount|Owned timer refs cleared on unmount|
