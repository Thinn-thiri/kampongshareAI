// @ts-check
// Small Leaflet + OpenStreetMap maps with one pin. Needs the Leaflet CSS and JS loaded first.

const SINGAPORE_CENTRE = { lat: 1.3521, lng: 103.8198 };

/**
 * @typedef {Object} PinMap
 * @property {(lat: number, lng: number) => void} setPin  moves (or adds) the pin
 * @property {(lat: number, lng: number) => void} focus  moves the pin there and zooms the map in on it
 * @property {() => void} centre  puts the pin at the middle of the map (keyboard-friendly)
 * @property {() => void} refresh  call after the map's box changes size or becomes visible
 */

/**
 * Rounds to 6 decimal places (about 10 cm) — plenty for a map pin.
 * @param {number} value
 * @returns {number}
 */
function roundCoord(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * A map with one pin per event; each popup links to event.html?id=.
 * Popups are built with textContent, so event text can't inject HTML.
 * @param {HTMLElement} element
 * @param {{ id: string, title: string, latitude: number, longitude: number, starts_at: string,
 *           ends_at?: string | null, location_name?: string | null }[]} events
 * @returns {void}
 */
function createEventsMap(element, events) {
  const L = /** @type {any} */ (window).L;
  const map = L.map(element, { scrollWheelZoom: false }).setView([SINGAPORE_CENTRE.lat, SINGAPORE_CENTRE.lng], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  for (const event of events) {
    const popup = document.createElement("div");
    const title = document.createElement("p");
    title.className = "font-semibold";
    title.textContent = event.title;
    const when = document.createElement("p");
    when.textContent = formatEventTime(event.starts_at, event.ends_at);
    popup.append(title, when);
    if (event.location_name) {
      const where = document.createElement("p");
      where.textContent = event.location_name;
      popup.append(where);
    }
    const link = document.createElement("a");
    link.href = `/event.html?id=${encodeURIComponent(event.id)}`;
    link.className = "font-semibold text-primary underline";
    link.textContent = "View event";
    popup.append(link);

    L.marker([event.latitude, event.longitude], { title: event.title, alt: `${event.title} pin` })
      .addTo(map)
      .bindPopup(popup);
  }

  if (events.length > 1) {
    map.fitBounds(events.map((event) => [event.latitude, event.longitude]), { padding: [30, 30], maxZoom: 15 });
  } else if (events.length === 1) {
    map.setView([events[0].latitude, events[0].longitude], 15);
  }
}

/**
 * Creates a map with an optional pin. When editable, clicking the map or dragging the pin calls onPick.
 * @param {HTMLElement} element
 * @param {{ lat?: number | null, lng?: number | null, editable?: boolean, label?: string,
 *           onPick?: (lat: number, lng: number) => void }} options
 * @returns {PinMap}
 */
function createPinMap(element, options) {
  const L = /** @type {any} */ (window).L;
  const { lat, lng, editable = false, label = "Location", onPick } = options;
  const hasPin = lat != null && lng != null;

  const map = L.map(element, { scrollWheelZoom: false }).setView(
    hasPin ? [lat, lng] : [SINGAPORE_CENTRE.lat, SINGAPORE_CENTRE.lng],
    hasPin ? 16 : 11,
  );
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  /** @type {any} */
  let marker = null;

  /**
   * @param {number} pinLat
   * @param {number} pinLng
   */
  function setPin(pinLat, pinLng) {
    if (marker) {
      marker.setLatLng([pinLat, pinLng]);
      return;
    }
    marker = L.marker([pinLat, pinLng], { draggable: editable, title: label, alt: `${label} pin` }).addTo(map);
    if (editable) {
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        onPick?.(roundCoord(point.lat), roundCoord(point.lng));
      });
    }
  }

  if (hasPin) setPin(lat, lng);

  if (editable) {
    map.on("click", (/** @type {{ latlng: { lat: number, lng: number } }} */ event) => {
      setPin(event.latlng.lat, event.latlng.lng);
      onPick?.(roundCoord(event.latlng.lat), roundCoord(event.latlng.lng));
    });
  }

  return {
    setPin,
    focus(pinLat, pinLng) {
      setPin(pinLat, pinLng);
      map.setView([pinLat, pinLng], 17);
    },
    centre() {
      const point = map.getCenter();
      setPin(point.lat, point.lng);
      onPick?.(roundCoord(point.lat), roundCoord(point.lng));
    },
    refresh() {
      map.invalidateSize();
    },
  };
}
