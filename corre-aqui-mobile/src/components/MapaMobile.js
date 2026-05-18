import React, { useEffect, useState } from 'react';
import { View, Dimensions, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { ref, onValue } from 'firebase/database';
import { database, firebaseConfigReady } from '../lib/firebase';

export default function MapaMobile() {
  const [location, setLocation] = useState(null);
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Ative a localização para usar o app.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  useEffect(() => {
    if (!firebaseConfigReady || !database) {
      Alert.alert(
        'Configuração pendente',
        'Defina as variáveis EXPO_PUBLIC_FIREBASE_* para carregar o mapa mobile.'
      );
      return undefined;
    }

    const pedidosRef = ref(database, 'pedidos');
    const off = onValue(pedidosRef, (snapshot) => {
      try {
        const data = snapshot.val() || {};
        const lista = Object.entries(data)
          .map(([id, pedido]) => {
            const { local } = pedido || {};
            return {
              id,
              ...pedido,
              latitude: local?.lat,
              longitude: local?.lng,
            };
          })
          .filter((pedido) => pedido.latitude && pedido.longitude);

        setPedidos(lista);
      } catch (err) {
        console.error('Erro ao carregar pedidos:', err);
      }
    });

    return () => off();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {location && (
        <MapView
          style={{
            width: Dimensions.get('window').width,
            height: Dimensions.get('window').height,
          }}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
        >
          {pedidos.map((pedido) => (
            <Marker
              key={pedido.id}
              coordinate={{
                latitude: pedido.latitude,
                longitude: pedido.longitude,
              }}
              title={pedido.titulo || pedido.texto || 'Pedido'}
              description={`Status: ${pedido.status || 'aberto'}`}
            />
          ))}

          {pedidos[0]?.latitude && (
            <Polyline
              coordinates={[
                {
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
                {
                  latitude: pedidos[0].latitude,
                  longitude: pedidos[0].longitude,
                },
              ]}
              strokeColor="#2563eb"
              strokeWidth={4}
            />
          )}
        </MapView>
      )}
    </View>
  );
}
