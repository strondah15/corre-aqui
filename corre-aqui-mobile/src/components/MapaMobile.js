import React, { useEffect, useState } from 'react';
import { View, Dimensions, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { getDatabase, ref, onValue } from 'firebase/database';
import { initializeApp } from 'firebase/app';

// 🔥 Config Firebase (substitua pela sua se precisar)
const firebaseConfig = {
  apiKey: "AIzaSyB00EWcGeFFa00do2FAbujENb5quVyUPgo",
  authDomain: "corre-aqui-3f9ec.firebaseapp.com",
  databaseURL: "https://corre-aqui-3f9ec-default-rtdb.firebaseio.com",
  projectId: "corre-aqui-3f9ec",
  storageBucket: "corre-aqui-3f9ec.firebasestorage.app",
  messagingSenderId: "43953100978",
  appId: "1:43953100978:web:a85f649cf0ca09140f11ab"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export default function MapaMobile() {
  const [location, setLocation] = useState(null);
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Ative a localização para usar o app');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  useEffect(() => {
    onValue(pedidosRef, (snapshot) => {
  try {
    const data = snapshot.val() || {};
    const lista = Object.entries(data).map(([id, pedido]) => {
      const { local } = pedido;
      return {
        id,
        ...pedido,
        latitude: local?.lat,
        longitude: local?.lng,
      };
    });
    setPedidos(lista);
  } catch (err) {
    console.error('Erro ao carregar pedidos:', err);
  }
});

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
            pedido.latitude && pedido.longitude && (
              <Marker
                key={pedido.id}
                coordinate={{
                  latitude: pedido.latitude,
                  longitude: pedido.longitude,
                }}
                title={pedido.texto || 'Pedido'}
                description={`Status: ${pedido.status}`}
              />
            )
          ))}

          {/* Linha azul para o primeiro pedido, só como exemplo */}
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
              strokeColor="#0000FF"
              strokeWidth={4}
            />
          )}
        </MapView>
      )}
    </View>
  );
}
