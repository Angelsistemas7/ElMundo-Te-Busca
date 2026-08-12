"use client";

import { useEffect, useRef } from "react";
import {
  LayerGroup,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// El control nativo de Leaflet, con `collapsed:false` (como estaba antes en
// escritorio), desactiva POR COMPLETO su interactividad — nunca instala
// ningún manejador de expandir/colapsar, queda forzado abierto para siempre,
// ni con el mouse se puede ocultar. Y con `collapsed:true` (como ya estaba en
// móvil), el ícono que abre el panel solo sabe EXPANDIR: al tocarlo una
// segunda vez no hace nada (su propio manejador de clic solo llama a
// `expand()`), y encima el CSS de Leaflet oculta ese mismo ícono mientras
// está expandido (`.leaflet-control-layers-expanded .leaflet-control-layers-
// toggle{display:none}`) — no queda ningún botón visible para volver a
// cerrarlo. Por eso ahora el control SIEMPRE arranca colapsado (mismo
// comportamiento en escritorio y móvil, para poder ocultarlo en los dos) y,
// tras montarse, se reemplaza el manejador de clic del ícono por uno propio
// que sí alterna abierto/cerrado — ver `wireLayersToggle` más abajo. El
// desplegable de hover en escritorio (mouseenter/mouseleave) sigue intacto,
// esto solo cambia qué pasa al hacer CLIC.
function wireLayersToggle(container: HTMLElement) {
  const toggle = container.querySelector<HTMLElement>(".leaflet-control-layers-toggle");
  if (!toggle) return;
  function onClick(e: Event) {
    e.preventDefault();
    e.stopImmediatePropagation();
    container.classList.toggle("leaflet-control-layers-expanded");
  }
  // Captura (antes de que burbujee): así se adelanta al manejador propio de
  // Leaflet en el mismo ícono (que solo expande) y lo reemplaza sin pelear
  // con él en el mismo ciclo de evento.
  toggle.addEventListener("click", onClick, true);
  return () => toggle.removeEventListener("click", onClick, true);
}

export type Zone = {
  key: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  toLocate: number;
  located: number;
  deceased: number;
};
export type AidMarker = {
  id: string;
  name: string;
  typeLabel: string;
  emoji: string;
  lat: number;
  lng: number;
  verified: boolean;
  href: string;
};
export type MarchMarker = { id: string; title: string; lat: number; lng: number; when: string; href: string };
export type HospitalMarker = {
  id: string;
  name: string;
  statusLabel: string;
  color: string;
  lat: number;
  lng: number;
  href: string;
};
export type RescueMarker = {
  id: string;
  body: string;
  locationText: string;
  lat: number;
  lng: number;
  when: string;
  href: string;
};
/** Alguien que pide ayuda (post tipo "necesito"), anclado a su ubicación. */
export type NeedMarker = {
  id: string;
  body: string;
  locationText: string;
  lat: number;
  lng: number;
  when: string;
  whatsappHref: string | null;
  directionsHref: string;
  href: string;
};
/** Persona con coordenada exacta (vista/encontrada), para pinearla en el mapa. */
export type PersonMarker = {
  id: string;
  name: string;
  statusLabel: string;
  unidentified: boolean;
  lat: number;
  lng: number;
  href: string;
};
/** Alguien que ofrece ayuda (voluntario o post "ofrezco"), anclado a su ubicación. */
export type HelpMarker = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  locationText: string;
  lat: number;
  lng: number;
  whatsappHref: string | null;
  directionsHref: string;
  href: string;
};

function zoneIcon(count: number) {
  const size = Math.max(28, Math.min(72, 24 + Math.sqrt(count) * 6));
  const label = count > 999 ? `${Math.round(count / 1000)}k` : String(count);
  return L.divIcon({
    className: "",
    html: `<div class="zone-marker" style="--size:${size}px"><span class="zone-pulse"></span><span class="zone-core">${label}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function pinIcon(kind: "aid" | "march" | "need" | "help" | "person", emoji: string) {
  return L.divIcon({
    className: "",
    html: `<div class="pin-marker pin-${kind}"><span>${emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -28],
  });
}

function hospitalIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div class="pin-marker" style="background:${color}"><span>🏥</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -28],
  });
}

function rescueIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="rescue-marker"><span class="rescue-ring"></span><span class="rescue-ring delay"></span><span class="rescue-core">🚨</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -16],
  });
}

function epicenterIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="epicenter-marker"><span class="epi-ring r1"></span><span>⊕</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

const popupLink = { color: "#0369a1", fontWeight: 600, display: "inline-block", marginTop: 4 } as const;
const waLink = { color: "#059669", fontWeight: 600, display: "inline-block", marginTop: 4 } as const;

export default function MapView({
  zones,
  aidPoints,
  marches,
  hospitals,
  rescues,
  needs,
  helps,
  persons,
  epicenter,
  center,
  zoom = 9,
}: {
  zones: Zone[];
  aidPoints: AidMarker[];
  marches: MarchMarker[];
  hospitals: HospitalMarker[];
  rescues: RescueMarker[];
  needs: NeedMarker[];
  helps: HelpMarker[];
  persons: PersonMarker[];
  epicenter?: [number, number] | null;
  center: [number, number];
  zoom?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // El contenedor del control lo crea Leaflet directamente en el DOM (no es
    // un nodo que React renderice), así que se busca después de montar. Un
    // solo intento con `requestAnimationFrame` de respaldo alcanza: Leaflet
    // ya lo pinta de forma síncrona al agregar el control al mapa.
    const container = root.querySelector<HTMLElement>(".leaflet-control-layers");
    if (container) return wireLayersToggle(container);
    const raf = requestAnimationFrame(() => {
      const late = root.querySelector<HTMLElement>(".leaflet-control-layers");
      if (late) wireLayersToggle(late);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} className="flex h-[68vh] min-h-[460px] w-full flex-col">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        className="min-h-0 w-full flex-1"
      >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {epicenter && (
        <Marker position={epicenter} icon={epicenterIcon()}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <strong>Epicentro del sismo</strong>
          </Tooltip>
          <Popup>
            <strong>Epicentro</strong>
            <br />
            ≈28 km al SE de Yumare (Yaracuy), profundidad 10 km.
          </Popup>
        </Marker>
      )}

      {/* Control nativo de Leaflet (checkboxes flotando sobre el mapa, esquina
          superior derecha) para encender/apagar cada capa. En móvil arranca
          colapsado (ver useIsMobile) para no tapar el mapa. */}
      <LayersControl position="topright" collapsed>
        <LayersControl.Overlay checked name="🆘 Necesito ayuda">
          <LayerGroup>
            {needs.map((n) => (
              <Marker key={n.id} position={[n.lat, n.lng]} icon={pinIcon("need", "🆘")} zIndexOffset={600}>
                <Popup>
                  <strong>🆘 Necesito ayuda</strong>
                  {n.locationText && (
                    <>
                      <br />
                      📍 {n.locationText}
                    </>
                  )}
                  <br />
                  <span style={{ display: "inline-block", marginTop: 4 }}>{n.body}</span>
                  <br />
                  <span style={{ color: "#71717a", fontSize: 11 }}>{n.when}</span>
                  {n.whatsappHref && (
                    <>
                      <br />
                      <a href={n.whatsappHref} target="_blank" rel="noreferrer" style={waLink}>
                        Escribir por WhatsApp →
                      </a>
                    </>
                  )}
                  <br />
                  <a href={n.directionsHref} target="_blank" rel="noreferrer" style={popupLink}>
                    Cómo llegar →
                  </a>
                  <br />
                  <a href={n.href} style={popupLink}>Ver en comunidad →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="🤲 Puedo ayudar">
          <LayerGroup>
            {helps.map((h) => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={pinIcon("help", h.emoji)} zIndexOffset={500}>
                <Popup>
                  <strong>{h.emoji} {h.title}</strong>
                  <br />
                  {h.subtitle}
                  {h.locationText && (
                    <>
                      <br />
                      📍 {h.locationText}
                    </>
                  )}
                  {h.whatsappHref && (
                    <>
                      <br />
                      <a href={h.whatsappHref} target="_blank" rel="noreferrer" style={waLink}>
                        Escribir por WhatsApp →
                      </a>
                    </>
                  )}
                  <br />
                  <a href={h.directionsHref} target="_blank" rel="noreferrer" style={popupLink}>
                    Cómo llegar →
                  </a>
                  <br />
                  <a href={h.href} style={popupLink}>Ver más →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="👤 Personas">
          <LayerGroup>
            {persons.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon("person", "👤")} zIndexOffset={400}>
                <Popup>
                  <strong>{p.unidentified ? "👤 Sin identificar" : p.name}</strong>
                  <br />
                  {p.statusLabel}
                  <br />
                  <a href={p.href} style={popupLink}>Ver ficha →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="🚨 Rescates">
          <LayerGroup>
            {rescues.map((r) => (
              <Marker key={r.id} position={[r.lat, r.lng]} icon={rescueIcon()} zIndexOffset={1000}>
                <Popup>
                  <strong>🚨 Rescate urgente</strong>
                  {r.locationText && (
                    <>
                      <br />
                      {r.locationText}
                    </>
                  )}
                  <br />
                  <span style={{ display: "inline-block", marginTop: 4 }}>{r.body}</span>
                  <br />
                  <span style={{ color: "#71717a", fontSize: 11 }}>{r.when}</span>
                  <br />
                  <a href={r.href} style={popupLink}>Ver en comunidad →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="📦 Puntos de ayuda">
          <LayerGroup>
            {aidPoints.map((a) => (
              <Marker key={a.id} position={[a.lat, a.lng]} icon={pinIcon("aid", a.emoji)}>
                <Popup>
                  <strong>{a.name}</strong>
                  <br />
                  {a.typeLabel}
                  {a.verified ? " · ✔ verificado" : " · por verificar"}
                  <br />
                  <a href={a.href} style={popupLink}>Ver punto →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="🏥 Hospitales">
          <LayerGroup>
            {hospitals.map((h) => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={hospitalIcon(h.color)}>
                <Popup>
                  <strong>{h.name}</strong>
                  <br />
                  Capacidad: {h.statusLabel}
                  <br />
                  <a href={h.href} style={popupLink}>Ver hospital →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="🚐 Caravanas">
          <LayerGroup>
            {marches.map((m) => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon("march", "🚐")}>
                <Popup>
                  <strong>{m.title}</strong>
                  <br />
                  Salida: {m.when}
                  <br />
                  <a href={m.href} style={popupLink}>Ver caravana →</a>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="🔴 Zonas afectadas">
          <LayerGroup>
            {zones.map((z) => (
              <Marker key={z.key} position={[z.lat, z.lng]} icon={zoneIcon(z.count)}>
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div style={{ textAlign: "center", lineHeight: 1.5 }}>
                    <strong>{z.name}</strong>
                    <br />
                    <span style={{ color: "#e11d48" }}>{z.toLocate.toLocaleString("es-VE")} por localizar</span>
                    <br />
                    <span style={{ color: "#059669" }}>{z.located.toLocaleString("es-VE")} localizados</span>
                    {z.deceased > 0 && (
                      <>
                        <br />
                        <span style={{ color: "#71717a" }}>{z.deceased.toLocaleString("es-VE")} sin vida</span>
                      </>
                    )}
                  </div>
                </Tooltip>
                <Popup>
                  <strong>{z.name}</strong>
                  <br />
                  {z.count.toLocaleString("es-VE")} personas registradas · {z.toLocate} por localizar ·{" "}
                  {z.located} localizados
                  {z.deceased > 0 ? ` · ${z.deceased} sin vida` : ""}.
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>
      </MapContainer>
    </div>
  );
}
