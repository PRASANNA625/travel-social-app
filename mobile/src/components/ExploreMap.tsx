import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export interface ExploreMapPin {
  id: string;
  lat: number;
  lng: number;
}

export interface ExploreMapPanTarget {
  lat: number;
  lng: number;
  zoom?: number;
}

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // India centroid, matches LocationPickerModal

// Shared verbatim with ExploreMap.web.tsx (Metro's platform-split sibling for
// web, since react-native-webview has no web implementation): the page posts
// messages via window.ReactNativeWebView.postMessage when embedded in a
// native WebView, and falls back to window.parent.postMessage when embedded
// in a plain <iframe> on web. It exposes window.setPins/setUserLocation/panTo
// as plain globals - called directly via injectJavaScript on native - AND
// listens for {type:"SET_PINS"|"SET_USER_LOCATION"|"PAN_TO", ...} postMessage,
// which is how the web variant drives the same functions (injectJavaScript
// does not apply to iframes). Both paths converge on one implementation.
// Follows the same pattern as LocationPickerModal.tsx's buildMapHtml.
function buildExploreMapHtml(): string {
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
    var tripMarkers = {};
    var userMarker = null;

    function sendToHost(payload) {
      var json = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      } else if (window.parent) {
        window.parent.postMessage(json, '*');
      }
    }

    window.setPins = function (pins) {
      Object.keys(tripMarkers).forEach(function (id) {
        map.removeLayer(tripMarkers[id]);
      });
      tripMarkers = {};
      var bounds = [];
      pins.forEach(function (pin) {
        var marker = L.marker([pin.lat, pin.lng]).addTo(map);
        marker.on('click', function () {
          sendToHost({ type: 'MARKER_TAPPED', tripId: pin.id });
        });
        tripMarkers[pin.id] = marker;
        bounds.push([pin.lat, pin.lng]);
      });
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    };

    window.setUserLocation = function (lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).addTo(map);
      }
    };

    window.panTo = function (lat, lng, zoom) {
      map.setView([lat, lng], zoom || 10);
    };

    // Native drives the map via injectJavaScript calling these functions
    // directly. Web (iframe) cannot use injectJavaScript, so it posts
    // messages instead, and this listener forwards them into the exact same
    // functions. Inert on native (nothing posts to it).
    window.addEventListener('message', function (event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.type) return;
        if (data.type === 'SET_PINS') {
          window.setPins(data.pins);
        } else if (data.type === 'SET_USER_LOCATION') {
          window.setUserLocation(data.lat, data.lng);
        } else if (data.type === 'PAN_TO') {
          window.panTo(data.lat, data.lng, data.zoom);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    window.onload = function () {
      sendToHost({ type: 'MAP_READY' });
    };
  </script>
</body>
</html>`;
}

export function ExploreMap({
  pins,
  userLocation,
  panTarget,
  onMarkerPress,
}: {
  pins: ExploreMapPin[];
  userLocation: { lat: number; lng: number } | null;
  panTarget: ExploreMapPanTarget | null;
  onMarkerPress: (tripId: string) => void;
}) {
  const webviewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapHtml = useMemo(buildExploreMapHtml, []);
  // WebView diffs `source` by reference, so a fresh `{ html: mapHtml }` object
  // literal on every render would otherwise look like a new source and could
  // reload the map. Memoize it (same reasoning as LocationPickerModal).
  const mapSource = useMemo(() => ({ html: mapHtml }), [mapHtml]);

  useEffect(() => {
    if (!mapReady) return;
    webviewRef.current?.injectJavaScript(`window.setPins(${JSON.stringify(pins)}); true;`);
  }, [mapReady, pins]);

  useEffect(() => {
    if (!mapReady || !userLocation) return;
    webviewRef.current?.injectJavaScript(
      `window.setUserLocation(${userLocation.lat}, ${userLocation.lng}); true;`
    );
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (!mapReady || !panTarget) return;
    webviewRef.current?.injectJavaScript(
      `window.panTo(${panTarget.lat}, ${panTarget.lng}, ${panTarget.zoom ?? 10}); true;`
    );
  }, [mapReady, panTarget]);

  const onWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "MAP_READY") {
        setMapReady(true);
      } else if (message.type === "MARKER_TAPPED") {
        onMarkerPress(message.tripId);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={styles.container}>
      <WebView ref={webviewRef} source={mapSource} onMessage={onWebViewMessage} style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
