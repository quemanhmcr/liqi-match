import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { sharedUiRecipes } from './internal/component-recipes';

export function AppBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={sharedUiRecipes.appBackground.gradient}
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
    backgroundColor: sharedUiRecipes.appBackground.bottomFade,
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cyanAtmosphere: {
    backgroundColor: sharedUiRecipes.appBackground.cyanAtmosphere,
    borderRadius: 300,
    height: 560,
    position: 'absolute',
    right: -342,
    top: 154,
    width: 560,
  },
  purpleAtmosphere: {
    backgroundColor: sharedUiRecipes.appBackground.purpleAtmosphere,
    borderRadius: 300,
    height: 560,
    left: -360,
    position: 'absolute',
    top: -104,
    width: 560,
  },
  vignette: {
    backgroundColor: sharedUiRecipes.appBackground.vignette,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
