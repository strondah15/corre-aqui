import React from 'react';
import { View } from 'react-native';
import MapaMobile from '../../src/components/MapaMobile';

export default function MapaTabScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#07111f' }}>
      <MapaMobile />
    </View>
  );
}
