export type RegistrationBackMode = 'register' | 'pending' | 'other';
export type RegistrationBackAction = 'dismiss_keyboard' | 'return_to_sign_in' | 'unhandled';

/** Pure decision used by the Android hardware Back handler. */
export function registrationBackAction(
  mode: RegistrationBackMode,
  keyboardVisible: boolean,
): RegistrationBackAction {
  if (mode !== 'register' && mode !== 'pending') return 'unhandled';
  if (mode === 'register' && keyboardVisible) return 'dismiss_keyboard';
  return 'return_to_sign_in';
}
