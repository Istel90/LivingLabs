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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
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
    overlayLayerRef.current = L.layerGroup().addTo(map);
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

  // Update climate/data overlays when selected layers change
  useEffect(() => {
    if (!mapRef.current || !overlayLayerRef.current) return;

    overlayLayerRef.current.clearLayers();

    const addCircle = (
      layerName: string,
      offsetLat: number,
      offsetLng: number,
      radius: number,
      color: string,
      fillOpacity = 0.22,
    ) => {
      L.circle([center[0] + offsetLat, center[1] + offsetLng], {
        radius,
        color,
        weight: 2,
        opacity: 0.85,
        fillColor: color,
        fillOpacity,
      })
        .bindPopup(layerName)
        .addTo(overlayLayerRef.current!);
    };

    const addLabel = (layerName: string, offsetLat: number, offsetLng: number, color: string) => {
      const safeLayerName = escapeHtml(layerName);
      L.marker([center[0] + offsetLat, center[1] + offsetLng], {
        icon: L.divIcon({
          className: 'climate-layer-label',
          html: `<span style="display:inline-block;padding:4px 8px;border-radius:999px;background:${color};color:white;font-size:12px;font-weight:700;box-shadow:0 4px 12px rgba(15,23,42,.2);">${safeLayerName}</span>`,
        }),
        interactive: false,
      }).addTo(overlayLayerRef.current!);
    };

    layers.forEach((layerName) => {
      switch (layerName) {
        case '폭염일수':
          addCircle(layerName, 0.012, -0.01, 1300, '#ef4444', 0.22);
          addCircle(layerName, -0.018, 0.018, 850, '#f97316', 0.2);
          addLabel(layerName, 0.024, -0.025, '#ef4444');
          break;
        case '고령인구 분포':
          addCircle(layerName, -0.012, -0.025, 1050, '#8b5cf6', 0.2);
          addCircle(layerName, 0.024, 0.024, 760, '#7c3aed', 0.18);
          addLabel(layerName, -0.028, -0.036, '#7c3aed');
          break;
        case '감염병 발생 현황':
          addCircle(layerName, 0.027, -0.002, 700, '#0ea5e9', 0.22);
          addCircle(layerName, -0.026, 0.006, 650, '#06b6d4', 0.2);
          addLabel(layerName, 0.038, 0.002, '#0284c7');
          break;
        case '침수흔적도':
          L.polygon(
            [
              [center[0] - 0.032, center[1] - 0.035],
              [center[0] - 0.015, center[1] + 0.035],
              [center[0] - 0.04, center[1] + 0.045],
              [center[0] - 0.055, center[1] - 0.012],
            ],
            {
              color: '#2563eb',
              weight: 3,
              opacity: 0.85,
              fillColor: '#60a5fa',
              fillOpacity: 0.24,
            },
          )
            .bindPopup(layerName)
            .addTo(overlayLayerRef.current!);
          addLabel(layerName, -0.053, 0.032, '#2563eb');
          break;
        case '취약계층 분포':
          L.rectangle(
            [
              [center[0] + 0.004, center[1] - 0.05],
              [center[0] + 0.032, center[1] - 0.002],
            ],
            {
              color: '#f59e0b',
              weight: 2,
              opacity: 0.85,
              fillColor: '#fbbf24',
              fillOpacity: 0.26,
            },
          )
            .bindPopup(layerName)
            .addTo(overlayLayerRef.current!);
          addLabel(layerName, 0.037, -0.052, '#d97706');
          break;
        case '무더위쉼터':
          [
            [0.01, 0.028],
            [-0.008, -0.008],
            [-0.029, 0.03],
          ].forEach(([latOffset, lngOffset], index) => {
            L.circleMarker([center[0] + latOffset, center[1] + lngOffset], {
              radius: 7,
              color: '#ffffff',
              weight: 2,
              fillColor: '#10b981',
              fillOpacity: 0.95,
            })
              .bindPopup(`${layerName} ${index + 1}`)
              .addTo(overlayLayerRef.current!);
          });
          addLabel(layerName, 0.018, 0.04, '#059669');
          break;
        default:
          if (layerName.startsWith('TIF:')) {
            const tifName = layerName.replace(/^TIF:/, '');
            L.rectangle(
              [
                [center[0] - 0.046, center[1] - 0.055],
                [center[0] + 0.046, center[1] + 0.055],
              ],
              {
                color: '#0f766e',
                weight: 3,
                dashArray: '8 6',
                opacity: 0.9,
                fillColor: '#14b8a6',
                fillOpacity: 0.16,
              },
            )
              .bindPopup(`TIF 레이어: ${escapeHtml(tifName)}`)
              .addTo(overlayLayerRef.current!);
            addLabel(`TIF ${tifName}`, 0.047, -0.055, '#0f766e');
          } else {
            addCircle(layerName, 0, 0, 900, '#0d9488', 0.18);
            addLabel(layerName, 0.015, 0.015, '#0d9488');
          }
          break;
      }
    });
  }, [layers, center]);

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
