import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getCurrentLocationOrThrow } from "../utils/currentLocation";

// Metro-platform-split sibling of LocationPickerModal.tsx (same convention
// as TripDateFields.tsx / TripDateFields.web.tsx): react-native-webview has
// no web implementation (its web bundle resolves to a stub that just renders
// "does not support this platform"), so this variant renders the same
// Leaflet page in a plain <iframe> instead of a native WebView. Same
// exported interface, same props, same search/current-location/reverse-geo
// logic as the native file - only the map-rendering and messaging mechanism
// differs.

export interface LocationValue {
  name: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India centroid

// Browsers block setting a custom User-Agent header from JS, so the web
// variant always uses a plain fetch (kept as its own function, mirroring the
// native file's nominatimFetch, so the two stay easy to compare side by side).
async function nominatimFetch(url: string): Promise<Response> {
  return fetch(url);
}

// Shared verbatim with LocationPickerModal.tsx: the page posts messages via
// window.ReactNativeWebView.postMessage when embedded in a native WebView,
// and falls back to window.parent.postMessage when embedded in this file's
// <iframe>. It also exposes window.setPin as a plain global - called
// directly via injectJavaScript on native - AND listens for a
// {type:"SET_PIN", lat, lng, zoom} postMessage, which is how this file
// drives the same setPin/placeMarker logic (injectJavaScript does not apply
// to iframes). Both paths converge on one implementation.
function buildMapHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map').setView([${DEFAULT_CENTER.lat}, ${DEFAULT_CENTER.lng}], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    var marker = null;

    function sendToHost(payload) {
      var json = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      } else if (window.parent) {
        window.parent.postMessage(json, '*');
      }
    }

    function post(lat, lng) {
      sendToHost({ type: "PIN_MOVED", lat: lat, lng: lng });
    }

    function placeMarker(lat, lng) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function () {
          var pos = marker.getLatLng();
          post(pos.lat, pos.lng);
        });
      }
    }

    map.on('click', function (e) {
      placeMarker(e.latlng.lat, e.latlng.lng);
      post(e.latlng.lat, e.latlng.lng);
    });

    window.setPin = function (lat, lng, zoom) {
      placeMarker(lat, lng);
      map.setView([lat, lng], zoom || 12);
    };

    // Native drives the map via injectJavaScript calling window.setPin(...)
    // directly. Web (iframe) cannot use injectJavaScript, so it posts a
    // SET_PIN message instead, and this listener forwards it into the exact
    // same window.setPin function. Inert on native (nothing posts to it).
    window.addEventListener('message', function (event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type === 'SET_PIN') {
          window.setPin(data.lat, data.lng, data.zoom);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    window.onload = function () {
      sendToHost({ type: "MAP_READY" });
    };
  </script>
</body>
</html>`;
}

// Plain CSS for the raw DOM <iframe> element - it is not a react-native-web
// component, so it takes a normal React DOM style object rather than an RN
// StyleSheet style.
const iframeStyle: CSSProperties = { flex: 1, width: "100%", height: "100%", border: "none" };

export function LocationPickerModal({
  visible,
  title,
  initialValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  initialValue: LocationValue | null;
  onClose: () => void;
  onSelect: (value: LocationValue) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationValue[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [preview, setPreview] = useState<LocationValue | null>(null);
  const mapHtml = useMemo(buildMapHtml, []);

  // Native's equivalent of this is webviewRef.current?.injectJavaScript(...);
  // an iframe has no injectJavaScript, so this posts a message that the
  // page's own listener (above) forwards into window.setPin(...).
  const sendToMap = (payload: { type: string; lat: number; lng: number; zoom?: number }) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), "*");
  };

  useEffect(() => {
    if (!visible) {
      setMapReady(false);
      return;
    }
    setQuery("");
    setResults([]);
    setPreview(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && mapReady && initialValue) {
      sendToMap({ type: "SET_PIN", lat: initialValue.lat, lng: initialValue.lng, zoom: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mapReady]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const response = await nominatimFetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8`
        );
        const data: NominatimResult[] = await response.json();
        setResults(
          data
            .map((item) => ({
              name: item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
            }))
            .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [query]);

  const movePin = (value: LocationValue) => {
    setPreview(value);
    setResults([]);
    setQuery("");
    sendToMap({ type: "SET_PIN", lat: value.lat, lng: value.lng, zoom: 12 });
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const response = await nominatimFetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data: NominatimResult = await response.json();
      setPreview({ name: data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    } catch {
      setPreview({ name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    } finally {
      setResolving(false);
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const coords = await getCurrentLocationOrThrow();
      sendToMap({ type: "SET_PIN", lat: coords.lat, lng: coords.lng, zoom: 13 });
      await reverseGeocode(coords.lat, coords.lng);
    } catch {
      // Discover's own Near Me flow already owns the user-facing
      // permission-denied messaging pattern this helper is shared with;
      // this picker just silently no-ops so the user can try again or
      // fall back to search/map.
    } finally {
      setLocating(false);
    }
  };

  // Native's equivalent of this is the WebView's onMessage prop; an iframe
  // instead posts to window.parent, so this listens on the window itself and
  // filters to messages that actually came from this modal's own iframe.
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message.type === "MAP_READY") {
          setMapReady(true);
        } else if (message.type === "PIN_MOVED") {
          reverseGeocode(message.lat, message.lng);
        }
      } catch {
        // ignore malformed messages
      }
    };
    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place..."
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
          />
          {searching && <ActivityIndicator size="small" color="#0f766e" />}
        </View>

        {results.length > 0 && (
          <View style={styles.resultsList}>
            {results.map((result, index) => (
              <TouchableOpacity
                key={`${result.lat}-${result.lng}-${index}`}
                style={styles.resultRow}
                onPress={() => movePin(result)}
              >
                <MaterialCommunityIcons name="map-marker-outline" size={16} color="#64748b" />
                <Text style={styles.resultText} numberOfLines={2}>
                  {result.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.currentLocationButton} onPress={useCurrentLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color="#0f766e" />
          ) : (
            <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#0f766e" />
          )}
          <Text style={styles.currentLocationText}>Use current location</Text>
        </TouchableOpacity>

        <View style={styles.mapWrap}>
          <iframe ref={iframeRef} srcDoc={mapHtml} style={iframeStyle} title="Location map" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.previewText} numberOfLines={2}>
            {resolving
              ? "Resolving location..."
              : preview
                ? preview.name
                : "Tap the map, search, or use current location"}
          </Text>
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !preview && styles.confirmButtonDisabled]}
              disabled={!preview}
              onPress={() => {
                if (preview) onSelect(preview);
              }}
            >
              <Text style={styles.confirmButtonText}>Use this location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#0f172a" },
  resultsList: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxHeight: 160,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  resultText: { flex: 1, fontSize: 13, color: "#334155" },
  currentLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  currentLocationText: { color: "#0f766e", fontWeight: "700", fontSize: 13 },
  mapWrap: { flex: 1, marginTop: 12, marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  previewText: { fontSize: 13, color: "#334155", marginBottom: 10 },
  footerButtons: { flexDirection: "row", gap: 10 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#f1f5f9" },
  cancelButtonText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  confirmButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#0f766e" },
  confirmButtonDisabled: { backgroundColor: "#94a3b8" },
  confirmButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
