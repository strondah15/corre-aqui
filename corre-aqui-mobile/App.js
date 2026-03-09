// App.js
import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import MapaMobile from './src/components/MapaMobile';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <MapaMobile />
    </SafeAreaView>
  );
}