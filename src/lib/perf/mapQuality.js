export function getMapQualityOptions(level) {
  switch (level) {
    case 'ultra': return { markerIconScale: 1.0, polylineWeight: 6, animations: true,  preferCanvas: false, tileBrightness: 0.98 }
    case 'high':  return { markerIconScale: 0.95, polylineWeight: 5, animations: true,  preferCanvas: true,  tileBrightness: 0.97 }
    case 'medium':return { markerIconScale: 0.9,  polylineWeight: 4, animations: false, preferCanvas: true,  tileBrightness: 0.96 }
    default:      return { markerIconScale: 0.85, polylineWeight: 3, animations: false, preferCanvas: true,  tileBrightness: 0.95 }
  }
}
