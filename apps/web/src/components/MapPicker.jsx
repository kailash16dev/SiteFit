import { useEffect, useRef, useState } from 'react';
import { MapPin, RotateCcw, Sun, Moon, Crosshair } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(mapLibreWorkerUrl);

const DEFAULT_START = { lat: 12.9716, lon: 77.5946 };
const MAP_STYLES = {
  bright: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const MAP_ATTRIBUTION = '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export default function MapPicker({ point, onChange, onClose }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const ringsRef = useRef([]);
  const mapLayerRef = useRef(null);
  const placePinRef = useRef(null);
  const ensurePinRef = useRef(null);
  const startPointRef = useRef(null);
  const [theme, setTheme] = useState('bright');
  const prevThemeRef = useRef(theme);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const toLatLng = val => {
    if (!val) return null;
    if (Array.isArray(val) && val.length >= 2) {
      const lat = Number(val[0]);
      const lon = Number(val[1]);
      return Number.isFinite(lat) && Number.isFinite(lon) ? L.latLng(lat, lon) : null;
    }
    if (typeof val === 'object') {
      const lat = Number(val.lat);
      const lon = Number(val.lng ?? val.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) ? L.latLng(lat, lon) : null;
    }
    return null;
  };

  useEffect(() => {
    if (!host.current || mapRef.current) return;

    const initial = point || DEFAULT_START;
    startPointRef.current = { lat: initial.lat, lon: initial.lon };
    const map = L.map(host.current, { zoomControl: true, scrollWheelZoom: false, minZoom: 1 })
      .setView([initial.lat, initial.lon], 12);
    const styleLayer = maplibreGL({ style: MAP_STYLES.bright }).addTo(map);

    const ensurePin = raw => {
      const latlng = toLatLng(raw);
      if (!latlng) return;
      if (!markerRef.current) {
        const icon = L.divIcon({
          className: 'sitefit-pin-wrap',
          html: '<span class="sitefit-pin"><i></i></span>',
          iconSize: [28, 38],
          iconAnchor: [14, 34],
        });
        const marker = L.marker(latlng, { draggable: true, icon }).addTo(map);
        marker.on('dragend', () => movePin(marker.getLatLng()));
        marker.on('click', () => movePin(marker.getLatLng()));
        markerRef.current = marker;
        ringsRef.current = [
          L.circle(latlng, { radius: 1000, color: '#087f68', weight: 2, fillColor: '#087f68', fillOpacity: 0.055, interactive: false, className: 'sitefit-radius-ring' }),
          L.circle(latlng, { radius: 5000, color: '#747b78', weight: 1.5, dashArray: '6 7', fillColor: '#747b78', fillOpacity: 0.018, interactive: false, className: 'sitefit-radius-ring' }),
        ];
        ringsRef.current.forEach(circle => circle.addTo(map));
      } else {
        markerRef.current.setLatLng(latlng);
        ringsRef.current.forEach(circle => circle.setLatLng(latlng));
      }
    };
    const movePin = raw => {
      const latlng = toLatLng(raw);
      if (!latlng) return;
      ensurePin(latlng);
      onChangeRef.current?.({ lat: latlng.lat, lon: latlng.lng });
    };
    placePinRef.current = movePin;

    if (point) ensurePin(point);
    map.on('click', event => movePin(event.latlng));
    mapRef.current = map;
    mapLayerRef.current = styleLayer;
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      mapLayerRef.current = null;
      placePinRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (point) {
      const latlng = toLatLng(point);
      if (latlng) {
        if (markerRef.current) {
          markerRef.current.setLatLng(latlng);
          ringsRef.current.forEach(circle => circle.setLatLng(latlng));
        } else {
          placePinRef.current?.(latlng);
        }
      }
    } else if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      ringsRef.current.forEach(circle => mapRef.current.removeLayer(circle));
      markerRef.current = null;
      ringsRef.current = [];
    }
  }, [point]);

  useEffect(() => {
    if (prevThemeRef.current === theme) return;
    prevThemeRef.current = theme;
    const glMap = mapLayerRef.current?.getMaplibreMap();
    if (glMap && MAP_STYLES[theme]) {
      glMap.setStyle(MAP_STYLES[theme]);
    }
  }, [theme]);

  const reset = () => {
    const map = mapRef.current;
    const start = startPointRef.current;
    if (!map || !start) return;
    map.setView([start.lat, start.lon], 12);
    placePinRef.current?.({ lat: start.lat, lng: start.lon });
  };

  return <section className="map-picker-card" aria-label="Map location picker">
    <div className="map-picker-head">
      <div className="map-picker-heading">
        <div className="map-picker-title-row"><h2>Map location picker</h2><span className="map-heading-kicker">SPATIAL CALIBRATION</span></div>
        <p>1 km local sample <span>•</span> 5 km comparison area</p>
      </div>
      <span className="map-precision-mode"><Crosshair size={14}/> Precision mode</span>
    </div>
    <div className={`map-stage ${theme}`}>
      <div className="map-host" ref={host}/>
      <div className="map-theme-toggle" role="group" aria-label="Map theme">
        <button className={theme === 'bright' ? 'selected' : ''} onClick={() => setTheme('bright')}><Sun size={14}/> Bright</button>
        <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}><Moon size={14}/> Dark</button>
      </div>
      <div className="map-legend">
        <div><i className="legend-pin"/>{point ? 'Selected site' : 'No pin selected'}</div>
        <div><i className="legend-local"/>1 km local sample</div>
        <div><i className="legend-comparison"/>5 km comparison area</div>
      </div>
    </div>
    <div className="map-picker-foot">
      <small>{point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` : 'Choose a site on the map'}</small>
      <div><button className="button" onClick={reset}><RotateCcw size={14}/> Reset pin</button><button className="button button-dark" disabled={!point} onClick={onClose}><MapPin size={15}/> Use this location</button></div>
    </div>
  </section>;
}
