import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { liqiComponents } from '@/shared/theme/liqi-design-system';

export function LiqiBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={liqiComponents.appBackground.gradient}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.purpleAtmosphere} />
      <View style={styles.cyanAtmosphere} />
      <View style={styles.vignette} />
      <View style={styles.bottomFade} />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomFade: {
    backgroundColor: liqiComponents.appBackground.bottomFade,
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cyanAtmosphere: {
    backgroundColor: liqiComponents.appBackground.cyanAtmosphere,
    borderRadius: 300,
    height: 560,
    position: 'absolute',
    right: -342,
    top: 154,
    width: 560,
  },
  purpleAtmosphere: {
    backgroundColor: liqiComponents.appBackground.purpleAtmosphere,
    borderRadius: 300,
    height: 560,
    left: -360,
    position: 'absolute',
    top: -104,
    width: 560,
  },
  vignette: {
    backgroundColor: liqiComponents.appBackground.vignette,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
