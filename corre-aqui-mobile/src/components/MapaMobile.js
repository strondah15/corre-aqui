import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { onValue, ref } from 'firebase/database';
import { database, firebaseConfigReady } from '../lib/firebase';

function hasCoords(pedido) {
  return Number.isFinite(pedido.latitude) && Number.isFinite(pedido.longitude);
}

export default function MapaMobile() {
  const [location, setLocation] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (status !== 'granted') {
        Alert.alert('Permissao negada', 'Ative a localizacao para usar o app.');
        setErro('Permissao de localizacao negada.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      if (active) setLocation(loc.coords);
    })().catch(() => {
      if (active) setErro('Nao foi possivel carregar sua localizacao.');
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!firebaseConfigReady || !database) {
      setErro('Defina as variaveis EXPO_PUBLIC_FIREBASE_* para carregar o mapa mobile.');
      return undefined;
    }

    const pedidosRef = ref(database, 'pedidos');
    const off = onValue(
      pedidosRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const lista = Object.entries(data)
          .map(([id, pedido]) => {
            const { local } = pedido || {};
            return {
              id,
              ...pedido,
              latitude: Number(local?.lat),
              longitude: Number(local?.lng),
            };
          })
          .filter(hasCoords);

        setPedidos(lista);
        setErro('');
      },
      (error) => {
        const code = String(error?.code || error?.message || '');
        setErro(
          code.includes('PERMISSION_DENIED')
            ? 'Entre com uma conta autorizada para ver os pedidos no mobile.'
            : 'Nao foi possivel carregar os pedidos agora.'
        );
      }
    );

    return () => off();
  }, []);

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          style={StyleSheet.absoluteFillObject}
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

          {hasCoords(pedidos[0] || {}) ? (
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
          ) : null}
        </MapView>
      ) : null}

      {!location && !erro ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0b73ff" />
          <Text style={styles.centerText}>Carregando mapa...</Text>
        </View>
      ) : null}

      {erro ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageTitle}>Mapa indisponivel</Text>
          <Text style={styles.messageText}>{erro}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    color: '#cbd5e1',
    fontWeight: '800',
  },
  messageBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  messageTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  messageText: {
    marginTop: 4,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
