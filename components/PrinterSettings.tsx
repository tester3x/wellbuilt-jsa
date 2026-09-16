import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { printerColors as colors } from '../constants/printerColors';
import { DEFAULT_PRINTER, PRINTER_BRANDS, refreshPrinter, updatePrinter, type PrinterDevice, type PrinterSettings as Settings } from '../services/thermalPrinter';
import { useLanguage } from '../app/contexts/LanguageContext';

export default function PrinterSettings() {
  const { t } = useLanguage();
  const [p,setP] = useState<Settings>(DEFAULT_PRINTER);
  const [devices,setDevices] = useState<PrinterDevice[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const generation = useRef(0);
  const saving = useRef(false);
  const refresh = useCallback(async (showDevices = false, request = false) => {
    if (saving.current) return;
    const current = ++generation.current;
    setBusy(true);
    try {
      const result = await refreshPrinter(request);
      if (current !== generation.current) return;
      setP(result.printer);
      if (showDevices || result.missing) setDevices(result.devices || []);
      if (result.missing) setMessage('The previous printer is no longer paired. Tap the printer you want to use below.');
      else if (showDevices) setMessage(result.devices?.length ? 'Paired devices refreshed. Tap the printer you want to use.' : 'No paired devices found. Pair your printer in Android Bluetooth settings.');
    } catch (e) { if (current === generation.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { if (current === generation.current) setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    void refresh();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(true); });
    return () => { generation.current++; sub.remove(); };
  }, [refresh]));
  const update = async (patch: Partial<Settings>, closeDevices = false) => {
    if (saving.current) return;
    saving.current = true;
    generation.current++;
    setBusy(true);
    try { const next = await updatePrinter(patch); setP(next); if (closeDevices) setDevices([]); setMessage(t('Selected printer: {printer}',{printer:next.name||t('none')})); }
    catch { setMessage('Could not save printer settings. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <View style={s.card}>
    <Text style={s.title}>{t('Printers')}</Text>
    <Text style={s.text}>{t('Thermal printer brand')}</Text>
    <View style={s.row}>{PRINTER_BRANDS.map(brand=><Pressable key={brand} disabled={busy} style={[s.choice,p.brand===brand&&s.selected]} onPress={()=>void update({brand})}><Text style={s.text}>{brand.charAt(0).toUpperCase()+brand.slice(1)}</Text></Pressable>)}</View>
    <Text style={s.text}>{t('Roll width')}</Text>
    <View style={s.row}>{([4,3] as const).map(width=><Pressable key={width} disabled={busy} style={[s.choice,p.width===width&&s.selected]} onPress={()=>void update({width})}><Text style={s.text}>{width}″</Text></Pressable>)}</View>
    <Text style={s.text}>{p.name || t('No thermal printer selected')}</Text>
    {p.brand !== 'brother' && <Text style={s.hint}>{t('Uses WB-T’s ESC/POS Bluetooth connection. Your printer must support ESC/POS mode; the brand alone does not guarantee compatibility.')}</Text>}
    {p.brand === 'brother' && <Text style={s.hint}>{t('Uses WB-T’s Brother RJ-4230B connection.')}</Text>}
    <Pressable disabled={busy} style={s.choice} onPress={()=>void refresh(true,true)}><Text style={s.text}>{t('Find / change thermal printer')}</Text></Pressable>
    {busy&&<ActivityIndicator color={colors.accent}/>}
    {devices.map(d=><Pressable key={d.macAddress} disabled={busy} style={[s.choice,p.macAddress===d.macAddress&&s.selected]} onPress={()=>void update({name:d.name,macAddress:d.macAddress},true)}><Text style={s.text}>{d.name || t('Bluetooth device')}</Text><Text style={s.hint}>{d.macAddress}</Text></Pressable>)}
    <Pressable onPress={()=>void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS').catch(()=>setMessage(t('Open Bluetooth settings on your phone to pair the printer.')))}><Text style={s.link}>{t('Open Bluetooth settings')}</Text></Pressable>
    <Text style={s.title}>{t('Regular printer')}</Text>
    <Text style={s.hint}>{t('Choose Regular printer when printing a JSA. Android’s print dialog handles HP Print Service and other installed printer services.')}</Text>
    {!!message&&<Text style={s.text}>{t(message)}</Text>}
  </View>;
}
const s=StyleSheet.create({card:{backgroundColor:colors.card,padding:16,borderRadius:14,gap:10,marginBottom:16},title:{color:colors.text,fontSize:18,fontWeight:'700'},text:{color:colors.text},hint:{color:colors.textMuted,fontSize:12},row:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{padding:12,borderWidth:1,borderColor:colors.cardBorder,borderRadius:8},selected:{borderColor:colors.accent},link:{color:colors.accent,paddingVertical:8}});

