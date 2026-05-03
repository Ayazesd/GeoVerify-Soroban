import { useEffect, useRef, useState, useMemo } from "react";
import { cellToBoundary, latLngToCell, gridDisk, getResolution, cellToChildren, cellToLatLng } from "h3-js";
import { Loader } from "@googlemaps/js-api-loader";

export interface PoiState {
  id: number;
  batch_id: number;
  h3_id: string;
  status: number; // 0: Pending, 1: Confirmed, 2: Rejected
  verify_count: number;
  dispute_count: number;
  author?: string;
  metadata_ipfs_hash?: string;
  voters?: string[]; // Oy veren cüzdan adreslerinin listesi
}

interface HexGridProps {
  apiKey?: string;
  mapId?: string;
  center: [number, number];
  poiStateMap: Record<string, PoiState>;
  onSelectZone?: (h3Id: string, state: PoiState | null) => void;
}

function getZonePalette(status?: number) {
  switch (status) {
    case 2: return { fill: "#ff0044", stroke: "#ff4477" }; // Rejected
    case 1: return { fill: "#00ff88", stroke: "#00ffcc" }; // Confirmed (Parlak Yeşil/Cyan)
    case 0: return { fill: "#ffcc00", stroke: "#ffe066" }; // Pending
    default: return { fill: "#1a1a2e", stroke: "#00ffcc" };
  }
}

// Ekran koordinatlarında iki nokta arası mesafe (lat/lng derece cinsinden)
// Normalleştirme için enlem farkı ~= metre, boylam farkı cos(lat) ile ölçeklendirilir
function latLngDistanceDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat1 - lat2;
  const dLng = (lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Mesafeye göre searchlight opacity hesapla
// maxDist: ışık yarıçapı (derece cinsinden), ~0.012 ≈ ~1.3 km
function searchlightOpacity(dist: number, maxDist: number): number {
  if (dist >= maxDist) return 0;

  // Yumuşak falloff: merkez=1, kenar=0
  // İyileştirilmiş formül: çok keskin değil, çok yumuşak değil
  const t = Math.pow(dist / maxDist, 0.6); // 0.6 üssü daha doğal görünür

  // Gaussian-inspired falloff daha pürüzsüz glow için
  return Math.max(0, Math.exp(-t * t * 5));
}

export function HexGrid({
  apiKey,
  mapId,
  center,
  poiStateMap,
  onSelectZone
}: HexGridProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const normalizedPoiMapRef = useRef<Record<string, PoiState>>({});

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hoveredH3s, setHoveredH3s] = useState<string[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(13);

  // Viewport merkezi (harita kaydıkça güncellenir)
  const mapCenterRef = useRef<{ lat: number; lng: number }>({ lat: center[1], lng: center[0] });

  hoveredH3s; // suppress unused warning — kullanılan dep'e dahil

  // Haritayı başlatma
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current || mapRef.current) return;

    let isDisposed = false;
    let styleTimer: ReturnType<typeof setTimeout> | null = null;

    async function bootMap() {
      try {
        const loader = new Loader({
          apiKey: apiKey!,
          version: "weekly",
          mapIds: mapId ? [mapId] : undefined
        });

        const { Map, InfoWindow } =
          (await loader.importLibrary("maps")) as google.maps.MapsLibrary;

        if (isDisposed || !mapContainerRef.current) return;

        const map = new Map(mapContainerRef.current, {
          center: { lng: center[0], lat: center[1] },
          zoom: 13,
          mapId: mapId || undefined,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: mapId ? undefined : [
            { elementType: "geometry", stylers: [{ color: "#080808" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#080808" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#555555" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f1f1f" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2a2a2a" }] },
            { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#282828" }] },
            { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#777777" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#020208" }] },
            { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1a1a2e" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
            { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0c0c0c" }] },
          ]
        });

        mapRef.current = map;
        infoWindowRef.current = new InfoWindow();

        // ─── Searchlight Style Callback ───────────────────────────────────────
        map.data.setStyle((feature: any) => {
          if (!feature) return {};

          const hexID = (feature.getProperty("hexID") as string) || "";
          const state = normalizedPoiMapRef.current[hexID];
          const status = state?.status;
          const hasState = !!state;
          const palette = getZonePalette(status);

          // Varsayılan stili kur
          let fillOpacity = hasState ? 0.56 : 0.08;
          let strokeOpacity = hasState ? 0.92 : 0.35;
          let strokeWeight = 1;
          let isGlowing = false;
          let glowColor = palette?.stroke ?? "#00ffcc";

          if (hexID) {
            try {
              const [hexLat, hexLng] = cellToLatLng(hexID);
              const { lat: cLat, lng: cLng } = mapCenterRef.current;
              const dist = latLngDistanceDeg(hexLat, hexLng, cLat, cLng);

              // Searchlight yarıçapı: zoom seviyesine göre dinamik
              const zoom = mapRef.current?.getZoom?.() ?? 13;
              // Zoom 13 → yarıçap geniş, Zoom 17 → dar (yakın view)
              const maxDist = Math.max(0.002, 0.18 / Math.pow(1.8, zoom - 13));

              const sl = searchlightOpacity(dist, maxDist);

              if (hasState) {
                // POI'li hücreler: minimum %30 görünür + searchlight boost
                fillOpacity = Math.max(0.30, 0.30 + sl * 0.50);
                strokeOpacity = Math.max(0.50, 0.50 + sl * 0.45);

                // Glow thresholds: çok sık glow görsün
                if (sl > 0.75) {
                  strokeWeight = 3.5;
                  glowColor = palette?.fill ?? "#00ff00";
                  isGlowing = true;
                } else if (sl > 0.55) {
                  strokeWeight = 2.8;
                  glowColor = palette?.stroke ?? "#ffff00";
                  isGlowing = true;
                } else if (sl > 0.35) {
                  strokeWeight = 2;
                  glowColor = palette?.stroke ?? "#00ffcc";
                  isGlowing = true;
                }
              } else {
                // Boş hover hücreleri: tamamen searchlight bağımlı
                fillOpacity = Math.max(0, sl * 0.20);
                strokeOpacity = Math.max(0, sl * 0.60);

                // Boş bölgeler için glow: daha sık görünsün
                if (sl > 0.65) {
                  strokeWeight = 2.2;
                  glowColor = "#00ffcc";
                  isGlowing = true;
                } else if (sl > 0.40) {
                  strokeWeight = 1.5;
                  glowColor = "#00ffcc";
                  isGlowing = true;
                }
              }
            } catch {
              // hexID geçersizse varsayılan stili koru — silent fail
              // Hata logu ekleme: console'a yazmıyoruz (production clean)
            }
          }

          return {
            fillColor: palette?.fill ?? "#1a1a2e",
            fillOpacity: Math.min(1, Math.max(0, fillOpacity)),
            strokeColor: isGlowing ? glowColor : (palette?.stroke ?? "#00ffcc"),
            strokeOpacity: Math.min(1, Math.max(0, strokeOpacity)),
            strokeWeight: Math.max(0.5, strokeWeight),
            clickable: true,
          };
        });
        // ──────────────────────────────────────────────────────────────────────

        // Data Layer Tıklama
        map.data.addListener("click", (event: any) => {
          const h3Id = event.feature.getProperty("hexID") as string;
          // normalizedPoiMapRef'i kullan — hem res-8 hem res-9 h3Id'lerini yakalar
          const stateToPass = normalizedPoiMapRef.current[h3Id] || null;
          onSelectZone?.(h3Id, stateToPass);

          if (infoWindowRef.current && event.latLng) {
            if (stateToPass) {
              infoWindowRef.current.setContent(
                `<strong>POI #${stateToPass.id}</strong><br/>
                Durum: ${stateToPass.status === 1 ? "Doğrulandı" : stateToPass.status === 2 ? "Malicious" : "İşlemde"}<br/>
                Olumlu: ${stateToPass.verify_count} | Olumsuz: ${stateToPass.dispute_count}`
              );
            } else {
              infoWindowRef.current.setContent(`<strong>Boş Bölge</strong><br/><small>${h3Id}</small>`);
            }
            infoWindowRef.current.setPosition(event.latLng);
            infoWindowRef.current.open({ map });
          }
        });

        // Harita kaydığında / zoom değiştiğinde merkezi güncelle ve stilleri yeniden uygula
        const refreshStyles = () => {
          const c = map.getCenter?.();
          if (c) {
            mapCenterRef.current = { lat: c.lat(), lng: c.lng() };
          }

          // Debounce: art arda gelen olayları 100ms'de bir grupla (daha smooth, daha responsive)
          if (styleTimer) clearTimeout(styleTimer);
          styleTimer = setTimeout(() => {
            if (mapRef.current?.data) {
              // requestAnimationFrame ile ekran refresh hızında render
              requestAnimationFrame(() => {
                const currentStyle = mapRef.current?.data?.getStyle?.();
                if (currentStyle) {
                  mapRef.current?.data?.setStyle?.(currentStyle);
                }
              });
            }
          }, 100);
        };

        map.addListener("center_changed", refreshStyles);
        map.addListener("zoom_changed", () => {
          const zoom = map.getZoom?.() ?? 13;
          setZoomLevel(zoom);
          refreshStyles();
          if (zoom < 16) {
            setHoveredH3s([]);
          }
        });

        map.addListener("idle", () => {
          const zoom = map.getZoom?.() ?? 13;
          setZoomLevel(zoom);
          refreshStyles();
        });

        // Fare: hover ring (zoom ≥ 16)
        map.addListener("mousemove", (event: any) => {
          const zoom = map.getZoom?.() ?? 13;
          if (zoom < 16 || !event?.latLng) return;

          const lat = event.latLng?.lat?.();
          const lng = event.latLng?.lng?.();

          if (typeof lat !== 'number' || typeof lng !== 'number') return;

          try {
            const centerCell = latLngToCell(lat, lng, 9);
            const ring = gridDisk(centerCell, 2);
            setHoveredH3s(prev => {
              if (prev.length === ring.length && prev[0] === ring[0]) return prev;
              return ring;
            });
          } catch {
            // Geçersiz koordinat — silent fail
          }
        });

        setMapReady(true);
      } catch (error) {
        setMapError(
          error instanceof Error
            ? `İşlem başarısız: Harita başlatma hatası — ${error.message}`
            : "İşlem başarısız: Google Haritalar başlatılamadı."
        );
      }
    }

    void bootMap();

    return () => {
      isDisposed = true;
      if (styleTimer) clearTimeout(styleTimer);
      if (mapRef.current) {
        mapRef.current.data.forEach((feature) => mapRef.current!.data.remove(feature));
      }
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, center, mapId]);

  // H3 Normalizasyon: res-8 → res-9 (useMemo ile cache'le)
  const normalizedPoiMap = useMemo(() => {
    const map: Record<string, PoiState> = {};
    Object.entries(poiStateMap).forEach(([id, state]) => {
      const res = getResolution(id);
      if (res === 9) {
        map[id] = state;
      } else if (res === 8) {
        const children = cellToChildren(id, 9);
        children.forEach(child => { map[child] = state; });
      } else {
        map[id] = state;
      }
    });
    return map;
  }, [poiStateMap]);

  // normalizedPoiMapRef'i her zaman güncel tut (click ve hover'da kullanılmak üzere)
  useEffect(() => {
    normalizedPoiMapRef.current = normalizedPoiMap;
  }, [normalizedPoiMap]);

  // Hücreleri Data Layer ile çiz
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    map.data.forEach((feature) => map.data.remove(feature));

    const poiCells = Object.keys(normalizedPoiMap);
    const allCells = Array.from(new Set([...poiCells, ...hoveredH3s]));

    if (allCells.length === 0) return;

    const features = allCells.map(id => {
      const state = normalizedPoiMap[id];
      const boundary = cellToBoundary(id, true);
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [boundary] },
        properties: {
          hexID: id,
          hasState: !!state,
          ...(state ? state : {})
        }
      };
    });

    map.data.addGeoJson({ type: "FeatureCollection", features });
  }, [mapReady, hoveredH3s, normalizedPoiMap]);

  if (!apiKey) {
    return (
      <div className="hexgrid hexgrid--fallback">
        <div className="hexgrid-fallback-header">
          <span className="eyebrow">Google Maps anahtarı eksik</span>
          <h3>Harita Önizlemesi</h3>
          <p>Haritayı görebilmek için .env dosyasına VITE_GOOGLE_MAPS_API_KEY ekleyin.</p>
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="hexgrid hexgrid--fallback">
        <div className="hexgrid-fallback-header">
          <span className="eyebrow">Google Haritalar hatası</span>
          <h3>Harita başlatılamadı</h3>
          <p>{mapError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hexgrid" style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainerRef} className="hexgrid-canvas" style={{ width: '100%', height: '100%' }} />

      {zoomLevel < 12 && (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 16px', borderRadius: 8, zIndex: 10 }}>
          Hücreleri görmek için haritayı yakınlaştırın
        </div>
      )}

      {/* Searchlight göstergesi */}
      <div style={{
        position: 'absolute', bottom: 30, left: 20, zIndex: 10,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0,255,204,0.2)', borderRadius: 12,
        padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {[
          { color: '#cccccc', label: 'Boş Bölge' },
          { color: '#ff0044', label: 'İtiraz Edilmiş' },
          { color: '#ffcc00', label: 'İnceleniyor' },
          { color: '#00ff00', label: 'Doğrulandı' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: color,
              width: 10, height: 10,
              borderRadius: 3,
              boxShadow: `0 0 6px ${color}`,
              display: 'inline-block',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: '#aaaaaa', fontFamily: 'monospace' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
