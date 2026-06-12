import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface ClimateMapProps {
  layers?: string[];
  center?: [number, number];
  zoom?: number;
  regionName?: string;
  markers?: Array<{
    id: string;
    lat: number;
    lng: number;
    label: string;
  }>;
}

export function ClimateMap({
  layers = [],
  center = [37.4563, 126.7052],
  zoom = 11,
  regionName = '인천광역시',
  markers = [],
}: ClimateMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  console.log('Rendering ClimateMap with center:', center, 'zoom:', zoom, 'markers:', markers);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // Already initialized

    console.log('Initializing Leaflet map');

    // Create map
    const map = L.map(containerRef.current, {
      center: center,
      zoom: zoom,
      zoomControl: true,
    });

    // CRITICAL: Add OpenStreetMap TileLayer - this must always be added
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      opacity: 1,
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    console.log('TileLayer added to map');

    // Create markers layer group
    markersLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    // Fix size after initialization
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        console.log('Map size invalidated');
      }
    }, 100);

    return () => {
      if (mapRef.current) {
        console.log('Cleaning up map');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map center and zoom when props change
  useEffect(() => {
    if (mapRef.current && center && zoom) {
      mapRef.current.setView(center, zoom);
      console.log('Map view updated to:', center, zoom);
    }
  }, [center, zoom]);

  // Update markers when props change
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    console.log('Updating markers, count:', markers.length);

    // Clear existing markers
    markersLayerRef.current.clearLayers();

    // Add region center marker if no custom markers provided
    if (markers.length === 0) {
      const regionMarker = L.marker(center).addTo(markersLayerRef.current);
      regionMarker.bindPopup(`<b>${regionName}</b><br>기후변화 리스크 설문 대상 지역`);

      // Add default risk area markers
      const riskAreas = [
        { lat: center[0] + 0.02, lng: center[1] - 0.08, name: '연안지역 - 해수면 상승 위험' },
        { lat: center[0] + 0.04, lng: center[1] + 0.02, name: '도심지역 - 폭염 취약계층 분포' },
        { lat: center[0] - 0.06, lng: center[1] - 0.06, name: '침수 취약지역' },
      ];

      riskAreas.forEach(area => {
        const marker = L.circleMarker([area.lat, area.lng], {
          radius: 8,
          fillColor: '#0d9488',
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.6,
        }).addTo(markersLayerRef.current!);
        marker.bindPopup(area.name);
      });
    } else {
      // Add custom markers from mapInfo
      markers.forEach(markerData => {
        const marker = L.marker([markerData.lat, markerData.lng]).addTo(markersLayerRef.current!);
        marker.bindPopup(`<b>${markerData.label}</b>`);
      });
    }
  }, [markers, center, regionName]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        minHeight: '400px',
        height: '100%',
        width: '100%',
        position: 'relative',
        zIndex: 0,
        background: '#f0f0f0'
      }}
    />
  );
}
