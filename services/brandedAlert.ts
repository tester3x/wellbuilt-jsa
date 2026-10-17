import type { AlertButton, AlertOptions } from 'react-native';

export type BrandedNotice = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const queue: BrandedNotice[] = [];
let listener: ((notice: BrandedNotice | null) => void) | undefined;
export const BrandedAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options });
    if (queue.length === 1) listener?.(queue[0]);
  },
};
export function subscribeBrandedAlert(next: (notice: BrandedNotice | null) => void) {
  listener = next;
  next(queue[0] || null);
  return () => { listener = undefined; };
}
export function dismissBrandedAlert() {
  queue.shift();
  listener?.(queue[0] || null);
}
