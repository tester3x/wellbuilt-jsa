import * as SecureStore from 'expo-secure-store';
import { retireLegacyAuthentication } from './jsaLegacyAuthRetirement';

export function retireLegacyAuthenticationKeys() {
  return retireLegacyAuthentication({
    remove: (key) => SecureStore.deleteItemAsync(key),
    read: (key) => SecureStore.getItemAsync(key),
  });
}
