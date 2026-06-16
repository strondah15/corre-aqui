import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const items = [
  ['Login', 'O app principal usa conta Google no PWA/web.'],
  ['Mapa', 'Pedidos com local aparecem quando o Firebase mobile esta configurado.'],
  ['Chat', 'Conversas completas estao no app web/PWA.'],
  ['Notificacoes', 'Estrutura FCM preparada no backend web.'],
];

export default function StatusScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Corre Aqui</Text>
        <Text style={styles.title}>Mobile em preparacao</Text>
        <Text style={styles.subtitle}>
          Esta versao Expo esta alinhada para testes de mapa. Para usuarios reais, priorize o PWA ate fechar login nativo.
        </Text>
      </View>

      <View style={styles.list}>
        {items.map(([title, text]) => (
          <View key={title} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardText}>{text}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  content: {
    flexGrow: 1,
    gap: 14,
    padding: 20,
    paddingBottom: 110,
  },
  header: {
    borderRadius: 24,
    backgroundColor: '#0f1d33',
    borderWidth: 1,
    borderColor: '#1f3556',
    padding: 18,
  },
  kicker: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  card: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  cardText: {
    marginTop: 4,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
