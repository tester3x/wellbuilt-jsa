import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRINTER_BRANDS = ['brother', 'epson', 'star', 'zebra', 'generic'] as const;
export type PrinterBrand = typeof PRINTER_BRANDS[number];
export type PrinterSettings = { brand: PrinterBrand; width: 3 | 4; name?: string; macAddress?: string };
export type PrinterDevice = { name: string; macAddress: string; isPrinter: boolean };
export const DEFAULT_PRINTER: PrinterSettings = { brand: 'brother', width: 4 };
const KEY = 'jsa.printer.v1';
export async function loadPrinter(): Promise<PrinterSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return DEFAULT_PRINTER;
  try {
    const p = JSON.parse(raw);
    return { brand: PRINTER_BRANDS.includes(p.brand) ? p.brand : 'brother', width: p.width === 3 ? 3 : 4,
      name: typeof p.name === 'string' ? p.name : undefined,
      macAddress: typeof p.macAddress === 'string' ? p.macAddress : undefined };
  } catch { return DEFAULT_PRINTER; }
}
let printerOperations: Promise<unknown> = Promise.resolve();
function serializePrinter<T>(operation: () => Promise<T>): Promise<T> {
  const result = printerOperations.then(operation, operation);
  printerOperations = result.catch(() => {});
  return result;
}
export const savePrinter = (p: PrinterSettings) => serializePrinter(() => AsyncStorage.setItem(KEY, JSON.stringify(p)));
// A mounted settings screen may have an older device selection. Only replace
// the fields the user actually changed, using the latest persisted settings.
export const updatePrinter = (patch: Partial<PrinterSettings>) => serializePrinter(async () => {
  const next = {...await loadPrinter(), ...patch};
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
});
export function samePrinterSelection(a: PrinterSettings | null, b: PrinterSettings) {
  return !!a && a.macAddress === b.macAddress && a.brand === b.brand && a.width === b.width;
}
async function permissions(request = true) {
  if (Platform.OS !== 'android' || !NativeModules.BrotherPrinter || !NativeModules.EscPosPrinter)
    throw new Error('Direct thermal printing requires the Android build with printer support. Regular printing is still available.');
  if (Number(Platform.Version) >= 31) {
    if (!request) {
      const allowed = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      if (!allowed) throw new Error('Nearby devices permission is needed to refresh paired printers.');
      return;
    }
    const result = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]);
    if (!Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED)) throw new Error('Allow Nearby devices permission to use your thermal printer.');
  }
}
export async function pairedPrinters(request = true): Promise<PrinterDevice[]> {
  await permissions(request);
  const devices: PrinterDevice[] = await NativeModules.BrotherPrinter.getBondedDevices();
  return devices.sort((a,b) => Number(b.isPrinter)-Number(a.isPrinter));
}
export function refreshPrinter(request = false) { return serializePrinter(async () => {
  let printer = await loadPrinter();
  let devices: PrinterDevice[] | null = null;
  try { devices = await pairedPrinters(request); }
  catch (e) { if (request) throw e; }
  const missing = !!printer.macAddress && !!devices && !devices.some(d => d.macAddress === printer.macAddress);
  if (missing) {
    printer = { brand: printer.brand, width: printer.width };
    await AsyncStorage.setItem(KEY, JSON.stringify(printer));
  }
  return { printer, devices, missing };
}); }
export async function printThermal(p: PrinterSettings, uri: string, progress: (page: number, total: number) => void) {
  await permissions();
  if (!p.macAddress) throw new Error('Select your paired printer in Settings first.');
  const devices = await pairedPrinters(false);
  if (!devices.some(d => d.macAddress === p.macAddress))
    throw new Error('The selected printer is no longer paired. Select a printer in Settings. No pages were sent.');
  // Expo's Android count is a WebView-height estimate, not the PDF's page tree.
  const pages = await NativeModules.BrotherPrinter.getPDFPageCount(uri);
  if (!Number.isInteger(pages) || pages < 1) throw new Error('PDF page count is unavailable; nothing was sent.');
  if (p.brand === 'brother') {
    progress(1, pages);
    try {
      // One native job owns the connection and all PDF pages. No tear-off timer
      // and no reconnect between pages of the same report.
      await NativeModules.BrotherPrinter.printPDF(p.macAddress, uri, p.width, -1);
      progress(pages, pages);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const message = e instanceof Error ? e.message : String(e);
      const noPages = ['CONNECT_ERROR','BT_ERROR','PERMISSION_ERROR','FILE_ERROR','PDF_ERROR'].includes(code || '');
      throw new Error(noPages ? `No pages were sent. ${message}` : message);
    }
    return;
  }
  for (let i = 0; i < pages; i++) {
    progress(i + 1, pages);
    try {
      await NativeModules.EscPosPrinter.printPDF(p.macAddress, uri, p.width, 203, i);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const note = i > 0 ? 'Earlier pages may have printed.'
        : ['CONNECT_ERROR','BT_ERROR','PERMISSION_ERROR','FILE_ERROR','PDF_ERROR'].includes(code || '')
          ? 'No pages were sent.' : 'Part of this page may have printed.';
      throw new Error(`Stopped on page ${i+1} of ${pages}. ${note} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
