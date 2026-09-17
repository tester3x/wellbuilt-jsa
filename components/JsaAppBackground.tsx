import React from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
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
  const { width, height } = useWindowDimensions();
  const source = sources[backgroundPackageId];
  const asset = Image.resolveAssetSource(source);
  const sceneWidth = width;
  const sceneHeight = sceneWidth * (asset.height / asset.width);
  const sceneBottom = Math.max(72, Math.round(height * 0.035));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame]}>
      <Image source={source} style={styles.backdrop} resizeMode="cover" blurRadius={8} />
      <Image
        source={source}
        style={[
          styles.scene,
          {
            width: sceneWidth,
            height: sceneHeight,
            left: 0,
            bottom: sceneBottom,
          },
        ]}
        resizeMode="stretch"
      />
      <View style={[StyleSheet.absoluteFill, styles.wash]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#dfe7e7' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
  },
  scene: {
    position: 'absolute',
  },
  wash: { backgroundColor: 'rgba(245,248,248,0.12)' },
});
