const { useState, useEffect, useRef } = React;
const IDB_NAME = "transit_idb";
const STORES = ["stops", "routes", "places"];
const DAMIETTA = [31.4165, 31.8133];
const STOP_TYPES = ["\u0645\u064A\u0643\u0631\u0648\u0628\u0627\u0635", "\u0623\u062A\u0648\u0628\u064A\u0633", "\u062A\u0648\u0643 \u062A\u0648\u0643", "\u0623\u062E\u0631\u0649"];
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s, { keyPath: "id" }));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function dbRun(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
const dbGetAll = (store) => dbRun(store, "readonly", (o) => o.getAll());
const dbPut = (store, value) => dbRun(store, "readwrite", (o) => o.put(value));
const dbRemove = (store, id) => dbRun(store, "readwrite", (o) => o.delete(id));
async function dbExportAll() {
  const out = {};
  for (const s of STORES) out[s] = await dbGetAll(s);
  return out;
}
function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
}
function validateStop(form, pos) {
  if (!form || !String(form.name || "").trim()) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0642\u0641.";
  if (!pos || pos.length !== 2 || !isFinite(pos[0]) || !isFinite(pos[1])) return "\u062D\u062F\u062F \u0645\u0643\u0627\u0646 \u0627\u0644\u0645\u0648\u0642\u0641 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629.";
  if (!STOP_TYPES.includes(form.type)) return "\u0627\u062E\u062A\u0631 \u0646\u0648\u0639 \u0627\u0644\u0645\u0648\u0642\u0641.";
  return null;
}
function makeStop(form, pos, accuracy) {
  return { id: newId(), name: form.name.trim(), type: form.type, area: (form.area || "").trim(), lat: pos[0], lng: pos[1], accuracy: accuracy || null, createdAt: Date.now() };
}
function distanceMeters(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pinIcon(kind) {
  return L.divIcon({ className: "", html: '<div class="pin ' + kind + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
}
function MapView({ stops, draft, picking, onPick, onDraftMove, onDelete }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const draftMarker = useRef(null);
  const live = useRef({});
  live.current = { picking, onPick, onDelete };
  useEffect(() => {
    const m = L.map(el.current).setView(DAMIETTA, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    m.on("click", (e) => live.current.picking && live.current.onPick([e.latlng.lat, e.latlng.lng]));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => m.remove();
  }, []);
  useEffect(() => {
    layer.current.clearLayers();
    stops.forEach((s) => {
      const box = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = s.name;
      const info = document.createElement("div");
      info.textContent = s.type + (s.area ? " - " + s.area : "");
      const del = document.createElement("button");
      del.className = "link";
      del.textContent = "\u062D\u0630\u0641 \u0627\u0644\u0645\u0648\u0642\u0641";
      del.onclick = () => live.current.onDelete(s.id);
      box.append(title, info, del);
      L.marker([s.lat, s.lng], { icon: pinIcon("stop") }).bindPopup(box).addTo(layer.current);
    });
  }, [stops]);
  useEffect(() => {
    if (draftMarker.current) {
      draftMarker.current.remove();
      draftMarker.current = null;
    }
    if (!draft) return;
    const mk = L.marker(draft, { icon: pinIcon("draft"), draggable: true }).addTo(map.current);
    mk.on("dragend", () => {
      const p = mk.getLatLng();
      onDraftMove([p.lat, p.lng]);
    });
    draftMarker.current = mk;
  }, [draft]);
  return /* @__PURE__ */ React.createElement("div", { ref: el, className: "map" });
}
function AddStopSheet({ form, setForm, pos, acc, msg, onHere, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return /* @__PURE__ */ React.createElement("div", { className: "sheet" }, /* @__PURE__ */ React.createElement("input", { placeholder: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0634\u0639\u0628\u064A \u0644\u0644\u0645\u0648\u0642\u0641", value: form.name, onChange: set("name") }), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("select", { value: form.type, onChange: set("type") }, STOP_TYPES.map((t) => /* @__PURE__ */ React.createElement("option", { key: t }, t))), /* @__PURE__ */ React.createElement("input", { placeholder: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", value: form.area, onChange: set("area") })), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { onClick: onHere }, "\u0623\u0646\u0627 \u0648\u0627\u0642\u0641 \u0647\u0646\u0627 \u062F\u0644\u0648\u0642\u062A\u064A"), /* @__PURE__ */ React.createElement("span", { className: "hint" }, pos ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0643\u0627\u0646" + (acc ? " (\u062F\u0642\u0629 " + acc + " \u0645)" : "") : "\u0623\u0648 \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629")), msg && /* @__PURE__ */ React.createElement("p", { className: "msg" }, msg), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: onSave }, "\u062D\u0641\u0638 \u0627\u0644\u0645\u0648\u0642\u0641"), /* @__PURE__ */ React.createElement("button", { onClick: onCancel }, "\u0625\u0644\u063A\u0627\u0621")));
}
const EMPTY_FORM = { name: "", type: STOP_TYPES[0], area: "" };
function App() {
  const [stops, setStops] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pos, setPos] = useState(null);
  const [acc, setAcc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState("");
  const load = () => dbGetAll("stops").then(setStops);
  useEffect(() => {
    load();
  }, []);
  const reset = () => {
    setAdding(false);
    setPos(null);
    setAcc(null);
    setForm(EMPTY_FORM);
    setMsg("");
  };
  const here = () => {
    setMsg("\u062C\u0627\u0631\u064A \u062A\u062D\u062F\u064A\u062F \u0645\u0643\u0627\u0646\u0643...");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setAcc(Math.round(p.coords.accuracy));
        setMsg("");
      },
      () => setMsg("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062F \u0645\u0643\u0627\u0646\u0643. \u0636\u0639 \u0627\u0644\u062F\u0628\u0648\u0633 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629."),
      { enableHighAccuracy: true, timeout: 15e3 }
    );
  };
  const save = async () => {
    const err = validateStop(form, pos);
    if (err) return setMsg(err);
    await dbPut("stops", makeStop(form, pos, acc));
    await load();
    reset();
  };
  const del = async (id) => {
    await dbRemove("stops", id);
    load();
  };
  const download = async () => {
    const blob = new Blob([JSON.stringify(await dbExportAll(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "damietta-transit.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "app" }, /* @__PURE__ */ React.createElement(MapView, { stops, draft: pos, picking: adding, onPick: (p) => {
    setPos(p);
    setAcc(null);
  }, onDraftMove: (p) => {
    setPos(p);
    setAcc(null);
  }, onDelete: del }), /* @__PURE__ */ React.createElement("div", { className: "bar" }, !adding ? /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: () => setAdding(true) }, "\u0625\u0636\u0627\u0641\u0629 \u0645\u0648\u0642\u0641"), /* @__PURE__ */ React.createElement("button", { onClick: download }, "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A (", stops.length, ")")) : /* @__PURE__ */ React.createElement(AddStopSheet, { form, setForm, pos, acc, msg, onHere: here, onSave: save, onCancel: reset })));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
