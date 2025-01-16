import React, { useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Popup, useMapEvents } from "react-leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";

function App() {
  const [segments, setSegments] = useState([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const searchSegments = async (bounds) => {
    setLoading(true);
    setErrorMessage(""); // Reset any previous error message
    console.log(bounds);

    let { south, west, north, east } = bounds;
    if (west < -180) {
      west += 360
    }
    if (east < -180) {
      east += 360
    }
    const query = `
        [out:json][timeout:15][bbox:${south}, ${west}, ${north}, ${east}];

        (
          wr["leisure"="park"];
          wr["leisure"="track"];
          wr["leisure"="nature_reserve"];  
        )->.areas;

        (
          .areas map_to_area;
        )->.areas;

        (
          way["highway"="pedestrian"];
          way["highway"="footpath"];
          way["highway"="footway"];
          way["designated"];
          way["yes"];
          way["foot"="use_sidepath"];
        )->.segments;

        (
          way.segments;
          -
          way.segments["access"="private"];
        )->.segments;
          
        way.segments(area.areas)->.segments;

        .segments out geom 100;
    `;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await axios.get(url, { timeout: 15000 });
      const geojson = {
        type: "FeatureCollection",
        features: response.data.elements.map((el) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: el.geometry.map((point) => [point.lon, point.lat]),
          },
          properties: el.tags,
          id: el.id, // Add an id for later identification
        })),
      };
      setSegments(geojson.features);
    } catch (error) {
      console.log(error)
      if (error.code === 'ECONNABORTED') {
        setErrorMessage("Query timed out. Try reducing the search area.");
      } else {
        setErrorMessage("An error occurred while fetching the data.");
      }
    } finally {
      setLoading(false); // Stop the loader after the query is completed or failed
    }
  };

  const clearSegments = () => {
    setSegments([]);
    setSelectedSegmentId(null);
    setErrorMessage(""); // Clear error message when clearing
  };

  const closeErrorMessage = () => {
    setErrorMessage(""); // Close the error message
  };

  return (
    <div>
      <h1>Footpath Explorer</h1>
      <ul>
        <li>Finds pedestrian-friendly paaths in parks and nature reserves (use at your own risk)</li>
        <li>Click on paths to explore details</li>
      </ul>
      <MapContainer center={[40.7128, -74.006]} zoom={15} style={{ height: "80vh", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <ButtonOverlay
          onSearch={(bounds) => searchSegments(bounds)}
          onClear={clearSegments}
          segments={segments}
          loading={loading}
        />
        {loading && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
            backgroundColor: "rgba(255, 255, 255, 0.7)", // Add some transparency to background
            padding: "20px",
            borderRadius: "5px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}>
            <div className="loader"></div>
            <p>Loading results...</p>
          </div>
        )}
        {errorMessage && (
          <div style={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            backgroundColor: "rgba(255, 255, 255, 0.9)", // Slight transparency to make it readable
            padding: "20px",
            borderRadius: "5px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between", // Align close button to the right
          }}>
            <p>{errorMessage}</p>
            <button onClick={closeErrorMessage} style={{
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
            }}>×</button>
          </div>
        )}
        {segments.length > 0 && (
          <GeoJSON
            data={segments}
            style={(feature) => {
              const isSelected = feature.id === selectedSegmentId;
              return {
                color: isSelected ? "darkblue" : "blue", // Dark blue for selected
                weight: isSelected ? 6 : 3, // Higher weight for selected segment
              };
            }}
            onEachFeature={(feature, layer) => {
              layer.on({
                click: () => {
                  if (selectedSegmentId === feature.id) {
                    setSelectedSegmentId(null); // Deselect if clicking the same segment
                  } else {
                    setSelectedSegmentId(feature.id); // Select the new segment
                  }
                },
              });
            }}
          />
        )}
        {selectedSegmentId && (
          <Popup
            position={[
              segments.find((segment) => segment.id === selectedSegmentId).geometry.coordinates[0][1],
              segments.find((segment) => segment.id === selectedSegmentId).geometry.coordinates[0][0],
            ]}
            onClose={() => setSelectedSegmentId(null)}
          >
            <div>
              <h3>Segment Details</h3>
              <pre style={{ fontSize: "0.9em" }}>
                {JSON.stringify(segments.find((segment) => segment.id === selectedSegmentId).properties, null, 2)}
              </pre>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}

function ButtonOverlay({ onSearch, onClear, segments, loading }) {
  const map = useMapEvents({
    click() {}, // Ensures the map listens to events.
  });

  const handleAction = () => {
    const bounds = map.getBounds();
    onSearch({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        zIndex: 1000,
      }}
    >
      <button
        onClick={handleAction}
        disabled={segments.length > 0 || loading} // Disable if segments are displayed or if loading
        style={{
          padding: "10px 20px",
          backgroundColor: segments.length > 0 || loading ? "#B0C4DE" : "#007BFF", // Light gray when disabled
          color: "#FFF",
          border: "none",
          borderRadius: "5px",
          cursor: segments.length > 0 || loading ? "not-allowed" : "pointer", // Disable cursor when button is disabled
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
          marginBottom: "10px", // Adds some space between the buttons
          opacity: segments.length > 0 || loading ? 0.6 : 1, // Dim the button when disabled
        }}
      >
        Search This Area
      </button>
      <button
        onClick={onClear}
        disabled={segments.length === 0 || loading} // Disable if no segments or if loading
        style={{
          padding: "10px 20px",
          backgroundColor: segments.length === 0 || loading ? "#B0C4DE" : "#28A745", // Light gray when disabled
          color: "#FFF",
          border: "none",
          borderRadius: "5px",
          cursor: segments.length === 0 || loading ? "not-allowed" : "pointer", // Disable cursor when button is disabled
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
          opacity: segments.length === 0 || loading ? 0.6 : 1, // Dim the button when disabled
        }}
      >
        Clear Segments
      </button>
    </div>
  );
}

export default App;
