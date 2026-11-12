import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import { CITY_CENTER } from '../../domain/cameras.js';
import { CONGESTION_LEVELS, INCIDENT_TYPES, SEVERITY } from '../../domain/constants.js';
import { useSettings } from '../../store/SettingsContext.jsx';

// Leaflet vẽ SVG ngoài cây React → dùng mã màu cố định thay cho biến CSS
const LEVEL_HEX = ['#16a34a', '#eab308', '#f97316', '#dc2626'];
// Nền bản đồ OpenStreetMap (miễn phí, không cần khóa API). Giao diện tối: làm tối bằng CSS filter (.map-dark)
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const incidentIcon = (inc) =>
  L.divIcon({
    className: '',
    html: `<div class="incident-pin sev-${inc.severity.toLowerCase()}">${INCIDENT_TYPES[inc.type].code}</div>`,
    iconSize: [30, 20],
    iconAnchor: [15, 26],
  });

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export function TrafficMap({
  cameras,
  incidents = [],
  focus,
  onSelectCamera,
  onSelectIncident,
  height = '100%',
  center = CITY_CENTER,
  zoom = 14,
  compact = false, // bản đồ thu nhỏ: tắt cuộn chuột để không "bắt" thao tác cuộn trang
}) {
  const { settings } = useSettings();
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: '100%', borderRadius: 12 }}
      scrollWheelZoom={!compact}
      zoomControl={!compact}
      attributionControl
    >
      <TileLayer
        key={settings.theme}
        url={OSM_TILES}
        className={settings.theme === 'dark' ? 'map-dark' : ''}
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FlyTo target={focus} />
      {cameras.map((c) => {
        const m = c.metric;
        const online = m?.online;
        const level = online ? m.level : 0;
        return (
          <CircleMarker
            key={c.id}
            center={[c.lat, c.lng]}
            radius={online ? 10 + level * 4 : 9}
            pathOptions={{
              color: online ? LEVEL_HEX[level] : '#64748b',
              fillColor: online ? LEVEL_HEX[level] : '#64748b',
              fillOpacity: online ? 0.35 : 0.2,
              weight: 2,
              dashArray: online ? undefined : '4 4',
            }}
            eventHandlers={{ click: () => onSelectCamera?.(c) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <strong>{c.name}</strong>
              <br />
              {online ? `${CONGESTION_LEVELS[level].label} · ${m.avgSpeed} km/h · ${m.flow} xe/ph` : 'Mất tín hiệu'}
            </Tooltip>
          </CircleMarker>
        );
      })}
      {incidents.map((inc) => (
        <Marker
          key={inc.id}
          position={[inc.location.lat + 0.0012, inc.location.lng + 0.0012]}
          icon={incidentIcon(inc)}
          eventHandlers={{ click: () => onSelectIncident?.(inc) }}
        >
          <Popup>
            <strong>{INCIDENT_TYPES[inc.type].label}</strong>
            <br />
            {inc.cameraName}
            <br />
            Mức độ: {SEVERITY[inc.severity].label} · {inc.id}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
