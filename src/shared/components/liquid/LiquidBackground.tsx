import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

export function LiquidBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#020510', '#071126', '#02040B']}
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
    backgroundColor: 'rgba(1,3,8,0.46)',
    bottom: 0,
    height: 150,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cyanAtmosphere: {
    backgroundColor: 'rgba(60,210,255,0.016)',
    borderRadius: 300,
    height: 560,
    position: 'absolute',
    right: -342,
    top: 154,
    width: 560,
  },
  purpleAtmosphere: {
    backgroundColor: 'rgba(130,80,255,0.020)',
    borderRadius: 300,
    height: 560,
    left: -360,
    position: 'absolute',
    top: -104,
    width: 560,
  },
  vignette: {
    backgroundColor: 'rgba(0,0,0,0.10)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
