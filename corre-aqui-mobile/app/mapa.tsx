import React from 'react';
import { View } from 'react-native';
import MapaMobile from '../src/components/MapaMobile'; // ou ajuste o caminho se for necessário

export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <MapaMobile />
    </View>
  );
}