import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../app/contexts/ThemeContext';
import type { JsaBackgroundPackage } from '../services/jsaBackground';

const sources: Record<JsaBackgroundPackage, number> = {
  'water-hauling': require('../assets/backgrounds/jsa-water-hauling.png'),
  ltl: require('../assets/backgrounds/jsa-ltl.png'),
  aggregate: require('../assets/backgrounds/jsa-aggregate.png'),
  transportation: require('../assets/backgrounds/jsa-transportation.png'),
};

export default function JsaAppBackground() {
  const { backgroundPackageId } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame]}>
      <Image source={sources[backgroundPackageId]} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <View style={[StyleSheet.absoluteFill, styles.wash]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#dfe7e7' },
  wash: { backgroundColor: 'rgba(245,248,248,0.22)' },
});
