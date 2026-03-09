import React from 'react';
import { View } from 'react-native';
import MapaMobile from '../src/components/MapaMobile';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <MapaMobile />
    </View>
  );
}
