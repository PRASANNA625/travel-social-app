import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { View } from "react-native";

// Metro-platform-split sibling of ExploreMap.tsx (same convention as
// LocationPickerModal.tsx / LocationPickerModal.web.tsx): react-native-webview
// has no web implementation, so this variant renders the same Leaflet page in
// a plain <iframe> instead of a native WebView. Same exported interface, same
// props, same marker/pan logic as the native file - only the map-rendering
// and messaging mechanism differs.

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

// Shared verbatim with ExploreMap.tsx: see that file's comment for the full
// explanation of the postMessage/injectJavaScript bridge convention.
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

// Plain CSS for the raw DOM <iframe> element - it is not a react-native-web
// component, so it takes a normal React DOM style object rather than an RN
// StyleSheet style.
const iframeStyle: CSSProperties = { flex: 1, width: "100%", height: "100%", border: "none" };

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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapHtml = useMemo(buildExploreMapHtml, []);

  // Native's equivalent of this is webviewRef.current?.injectJavaScript(...);
  // an iframe has no injectJavaScript, so this posts a message that the
  // page's own listener (above) forwards into the matching window.* function.
  const sendToMap = (payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), "*");
  };

  useEffect(() => {
    if (!mapReady) return;
    sendToMap({ type: "SET_PINS", pins });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, pins]);

  useEffect(() => {
    if (!mapReady || !userLocation) return;
    sendToMap({ type: "SET_USER_LOCATION", lat: userLocation.lat, lng: userLocation.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, userLocation]);

  useEffect(() => {
    if (!mapReady || !panTarget) return;
    sendToMap({ type: "PAN_TO", lat: panTarget.lat, lng: panTarget.lng, zoom: panTarget.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, panTarget]);

  // Native's equivalent of this is the WebView's onMessage prop; an iframe
  // instead posts to window.parent, so this listens on the window itself and
  // filters to messages that actually came from this component's own iframe.
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message.type === "MAP_READY") {
          setMapReady(true);
        } else if (message.type === "MARKER_TAPPED") {
          onMarkerPress(message.tripId);
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
    <View style={{ flex: 1 }}>
      <iframe ref={iframeRef} srcDoc={mapHtml} style={iframeStyle} title="Explore map" />
    </View>
  );
}
