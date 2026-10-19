import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadUsableGovernedSession } from './sso/jsaGovernedAuthLive';

const KEY = '@jsa/stay-return';
const welcomed = new Set<string>();
export function welcomeAlreadyEntered(uid: string, generation: string) {
  return welcomed.has(`${uid}:${generation}`);
}
export async function rememberJsaStay(url: string | null) {
  const owner = await loadUsableGovernedSession();
  if (!owner) return;
  if (url && new URL(url).protocol === 'wellbuilt-tickets:') {
    await AsyncStorage.setItem(KEY, JSON.stringify({ uid: owner.uid, generation: owner.generation, url }));
  }
  welcomed.add(`${owner.uid}:${owner.generation}`);
}
export async function ticketsReturnForCurrentOwner(): Promise<string | null> {
  const owner = await loadUsableGovernedSession();
  if (!owner) return null;
  try {
    const value = JSON.parse(await AsyncStorage.getItem(KEY) || 'null');
    if (value?.uid !== owner.uid || value?.generation !== owner.generation) return null;
    const current = await loadUsableGovernedSession();
    if (current?.uid !== owner.uid || current?.generation !== owner.generation) return null;
    return new URL(value.url).protocol === 'wellbuilt-tickets:' ? value.url : null;
  } catch { return null; }
}
