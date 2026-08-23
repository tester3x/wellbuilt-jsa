import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  CANONICAL_BASELINE_KEYS,
  GOVERNED_ASYNC_KEYS,
  GOVERNED_SECURE_KEYS,
  LOCAL_IDENTITY_ASYNC_KEYS,
  LOCAL_IDENTITY_SECURE_KEYS,
  requireStrictClear,
  strictClearAndVerify,
  type KeyValueStore,
} from './jsaStrictLogoutStorage';

const secure: KeyValueStore = {
  remove: (key) => SecureStore.deleteItemAsync(key),
  read: (key) => SecureStore.getItemAsync(key),
};
const asyncStore: KeyValueStore = {
  remove: (key) => AsyncStorage.removeItem(key),
  read: (key) => AsyncStorage.getItem(key),
};

export async function clearLocalIdentityStrictly(): Promise<void> {
  requireStrictClear(await strictClearAndVerify([
    { store: secure, keys: LOCAL_IDENTITY_SECURE_KEYS },
    { store: asyncStore, keys: LOCAL_IDENTITY_ASYNC_KEYS },
  ]));
}

export async function clearGovernedStateStrictly(): Promise<void> {
  requireStrictClear(await strictClearAndVerify([
    { store: secure, keys: GOVERNED_SECURE_KEYS },
    { store: asyncStore, keys: GOVERNED_ASYNC_KEYS },
  ]));
}

export async function clearCanonicalBaselineStrictly(): Promise<void> {
  requireStrictClear(await strictClearAndVerify([{ store: secure, keys: CANONICAL_BASELINE_KEYS }]));
}
