const { useState, useEffect, useRef } = React;
const IDB_NAME = "transit_idb";
const DB_VERSION = 2;
const STORES = ["stops", "routes", "places", "streets"];
const DAMIETTA = [31.4165, 31.8133];
const STOP_TYPES = ["\u0645\u064A\u0643\u0631\u0648\u0628\u0627\u0635", "\u0623\u062A\u0648\u0628\u064A\u0633", "\u062A\u0648\u0643 \u062A\u0648\u0643", "\u0623\u062E\u0631\u0649"];
const DIRECTIONS = ["\u0631\u0627\u064A\u062D \u062C\u0627\u064A", "\u0631\u0627\u064A\u062D \u0628\u0633"];
const KINDS = {
  stop: { store: "stops", label: "\u0645\u0648\u0642\u0641" },
  line: { store: "routes", label: "\u062E\u0637 \u0645\u064A\u0643\u0631\u0648\u0628\u0627\u0635" },
  street: { store: "streets", label: "\u0634\u0627\u0631\u0639 \u062C\u0627\u0646\u0628\u064A" },
  place: { store: "places", label: "\u0627\u0633\u0645 \u0645\u0646\u0637\u0642\u0629" }
};
let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, DB_VERSION);
      req.onupgradeneeded = () => STORES.forEach((s) => {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" });
      });
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
const hasText = (v) => String(v == null ? "" : v).trim() !== "";
const validPoint = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const validPath = (path) => Array.isArray(path) && path.length >= 2 && path.every(validPoint);
function distanceMeters(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pathLength(path) {
  let t = 0;
  for (let i = 1; i < path.length; i++) t += distanceMeters(path[i - 1], path[i]);
  return t;
}
function validateStop(form, pos) {
  if (!form || !hasText(form.name)) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0642\u0641.";
  if (!validPoint(pos)) return "\u062D\u062F\u062F \u0645\u0643\u0627\u0646 \u0627\u0644\u0645\u0648\u0642\u0641 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629.";
  if (!STOP_TYPES.includes(form.type)) return "\u0627\u062E\u062A\u0631 \u0646\u0648\u0639 \u0627\u0644\u0645\u0648\u0642\u0641.";
  return null;
}
function validatePlace(form, pos) {
  if (!form || !hasText(form.name)) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0632\u064A \u0645\u0627 \u0627\u0644\u0646\u0627\u0633 \u0628\u062A\u0642\u0648\u0644\u0647.";
  if (!validPoint(pos)) return "\u062D\u062F\u062F \u0645\u0643\u0627\u0646 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629.";
  return null;
}
function validateStreet(form, path) {
  if (!validPath(path)) return "\u0627\u0631\u0633\u0645 \u0627\u0644\u0634\u0627\u0631\u0639: \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629 \u0639\u0644\u0649 \u0646\u0642\u0637\u062A\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.";
  return null;
}
function validateLine(form, path) {
  if (!form || !hasText(form.name)) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u062E\u0637 (\u0645\u0646 \u0641\u064A\u0646 \u0644\u0641\u064A\u0646).";
  if (!validPath(path)) return "\u0627\u0631\u0633\u0645 \u0645\u0633\u0627\u0631 \u0627\u0644\u062E\u0637: \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629 \u0639\u0644\u0649 \u0646\u0642\u0637\u062A\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.";
  if (hasText(form.fare) && !(Number(form.fare) >= 0)) return "\u0627\u0644\u0623\u062C\u0631\u0629 \u0644\u0627\u0632\u0645 \u062A\u0643\u0648\u0646 \u0631\u0642\u0645.";
  return null;
}
function validateEntry(kind, form, point, path) {
  if (kind === "stop") return validateStop(form, point);
  if (kind === "place") return validatePlace(form, point);
  if (kind === "street") return validateStreet(form, path);
  if (kind === "line") return validateLine(form, path);
  return "\u0627\u062E\u062A\u0627\u0631 \u0647\u062A\u0636\u064A\u0641 \u0625\u064A\u0647 \u0627\u0644\u0623\u0648\u0644.";
}
const clean = (v) => String(v == null ? "" : v).trim();
function makeStop(form, pos, accuracy) {
  return { id: newId(), name: clean(form.name), type: form.type, area: clean(form.area), lat: pos[0], lng: pos[1], accuracy: accuracy || null, createdAt: Date.now() };
}
function makePlace(form, pos) {
  return { id: newId(), name: clean(form.name), otherNames: clean(form.otherNames), note: clean(form.note), lat: pos[0], lng: pos[1], createdAt: Date.now() };
}
function makeStreet(form, path) {
  return { id: newId(), name: clean(form.name), note: clean(form.note), path, lengthM: Math.round(pathLength(path)), createdAt: Date.now() };
}
function makeLine(form, path) {
  return { id: newId(), name: clean(form.name), fare: hasText(form.fare) ? Number(form.fare) : null, sign: clean(form.sign), direction: form.direction, path, lengthM: Math.round(pathLength(path)), createdAt: Date.now() };
}
function makeEntry(kind, form, point, path, accuracy) {
  if (kind === "stop") return makeStop(form, point, accuracy);
  if (kind === "place") return makePlace(form, point);
  if (kind === "street") return makeStreet(form, path);
  return makeLine(form, path);
}
function pinIcon(kind) {
  return L.divIcon({ className: "", html: '<div class="pin ' + kind + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
}
function popupBox(title, info, onDelete) {
  const box = document.createElement("div");
  const t = document.createElement("strong");
  t.textContent = title;
  const i = document.createElement("div");
  i.textContent = info;
  const del = document.createElement("button");
  del.className = "link";
  del.textContent = "\u062D\u0630\u0641";
  del.onclick = onDelete;
  box.append(t, i, del);
  return box;
}
function MapView({ data, draftPoint, draftPath, picking, onPick, onDraftMove, onDelete }) {
  const el = useRef(null);
  const map = useRef(null);
  const dataLayer = useRef(null);
  const draftLayer = useRef(null);
  const live = useRef({});
  live.current = { picking, onPick, onDelete, onDraftMove };
  useEffect(() => {
    const m = L.map(el.current).setView(DAMIETTA, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    m.on("click", (e) => live.current.picking && live.current.onPick([e.latlng.lat, e.latlng.lng]));
    dataLayer.current = L.layerGroup().addTo(m);
    draftLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => m.remove();
  }, []);
  useEffect(() => {
    const g = dataLayer.current;
    g.clearLayers();
    const del = (store, id) => () => live.current.onDelete(store, id);
    data.stops.forEach((s) => L.marker([s.lat, s.lng], { icon: pinIcon("stop") }).bindPopup(popupBox(s.name, s.type + (s.area ? " - " + s.area : ""), del("stops", s.id))).addTo(g));
    data.places.forEach((p) => L.marker([p.lat, p.lng], { icon: pinIcon("place") }).bindPopup(popupBox(p.name, p.otherNames ? "\u0648\u0628\u064A\u062A\u0642\u0627\u0644 \u0643\u0645\u0627\u0646: " + p.otherNames : p.note, del("places", p.id))).addTo(g));
    data.streets.forEach((s) => L.polyline(s.path, { color: "#5b6b70", weight: 4, dashArray: "6 8" }).bindPopup(popupBox(s.name || "\u0634\u0627\u0631\u0639 \u062C\u0627\u0646\u0628\u064A", s.note, del("streets", s.id))).addTo(g));
    data.lines.forEach((l) => L.polyline(l.path, { color: "#f2b705", weight: 5 }).bindPopup(popupBox(l.name, [l.fare != null ? l.fare + " \u062C\u0646\u064A\u0647" : "", l.direction, l.sign].filter(Boolean).join(" - "), del("routes", l.id))).addTo(g));
  }, [data]);
  useEffect(() => {
    const g = draftLayer.current;
    g.clearLayers();
    if (draftPoint) {
      const mk = L.marker(draftPoint, { icon: pinIcon("draft"), draggable: true }).addTo(g);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        live.current.onDraftMove([p.lat, p.lng]);
      });
    }
    if (draftPath.length) {
      L.polyline(draftPath, { color: "#0f4c5c", weight: 4 }).addTo(g);
      draftPath.forEach((p) => L.circleMarker(p, { radius: 5, color: "#0f4c5c", fillColor: "#fff", fillOpacity: 1 }).addTo(g));
    }
  }, [draftPoint, draftPath]);
  return /* @__PURE__ */ React.createElement("div", { ref: el, className: "map" });
}
const EMPTY_FORM = { name: "", type: STOP_TYPES[0], area: "", otherNames: "", note: "", fare: "", sign: "", direction: DIRECTIONS[0] };
const NAME_HINT = { stop: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0634\u0639\u0628\u064A \u0644\u0644\u0645\u0648\u0642\u0641", place: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0632\u064A \u0645\u0627 \u0627\u0644\u0646\u0627\u0633 \u0628\u062A\u0642\u0648\u0644\u0647", street: "\u0627\u0633\u0645 \u0627\u0644\u0634\u0627\u0631\u0639 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", line: "\u0627\u0633\u0645 \u0627\u0644\u062E\u0637 (\u0645\u0646 \u0641\u064A\u0646 \u0644\u0641\u064A\u0646)" };
function KindChooser({ onChoose, onCancel }) {
  return /* @__PURE__ */ React.createElement("div", { className: "sheet" }, /* @__PURE__ */ React.createElement("strong", null, "\u0647\u062A\u0636\u064A\u0641 \u0625\u064A\u0647\u061F"), /* @__PURE__ */ React.createElement("div", { className: "grid" }, Object.keys(KINDS).map((k) => /* @__PURE__ */ React.createElement("button", { key: k, onClick: () => onChoose(k) }, KINDS[k].label))), /* @__PURE__ */ React.createElement("button", { onClick: onCancel }, "\u0625\u0644\u063A\u0627\u0621"));
}
function EntryForm({ kind, form, setForm, point, path, acc, msg, onHere, onUndo, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isPath = kind === "street" || kind === "line";
  return /* @__PURE__ */ React.createElement("div", { className: "sheet" }, /* @__PURE__ */ React.createElement("strong", null, "\u0625\u0636\u0627\u0641\u0629 " + KINDS[kind].label), /* @__PURE__ */ React.createElement("input", { placeholder: NAME_HINT[kind], value: form.name, onChange: set("name") }), kind === "stop" && /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("select", { value: form.type, onChange: set("type") }, STOP_TYPES.map((t) => /* @__PURE__ */ React.createElement("option", { key: t }, t))), /* @__PURE__ */ React.createElement("input", { placeholder: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", value: form.area, onChange: set("area") })), kind === "place" && /* @__PURE__ */ React.createElement("input", { placeholder: "\u0623\u0633\u0645\u0627\u0621 \u062A\u0627\u0646\u064A\u0629 \u0644\u0644\u0645\u0643\u0627\u0646 \u062F\u0647 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", value: form.otherNames, onChange: set("otherNames") }), kind === "line" && /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("input", { placeholder: "\u0627\u0644\u0623\u062C\u0631\u0629 \u0628\u0627\u0644\u062C\u0646\u064A\u0647", inputMode: "decimal", value: form.fare, onChange: set("fare") }), /* @__PURE__ */ React.createElement("select", { value: form.direction, onChange: set("direction") }, DIRECTIONS.map((d) => /* @__PURE__ */ React.createElement("option", { key: d }, d)))), kind === "line" && /* @__PURE__ */ React.createElement("input", { placeholder: "\u0625\u0632\u0627\u064A \u062A\u0639\u0631\u0641 \u0627\u0644\u0645\u064A\u0643\u0631\u0648\u0628\u0627\u0635 (\u0644\u0648\u0646\u0647\u060C \u0627\u0644\u0645\u0646\u0627\u062F\u0627\u0629)", value: form.sign, onChange: set("sign") }), (kind === "street" || kind === "place") && /* @__PURE__ */ React.createElement("input", { placeholder: "\u0645\u0644\u0627\u062D\u0638\u0629 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", value: form.note, onChange: set("note") }), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { onClick: onHere }, isPath ? "\u0636\u064A\u0641 \u0645\u0643\u0627\u0646\u064A \u0643\u0646\u0642\u0637\u0629" : "\u0623\u0646\u0627 \u0648\u0627\u0642\u0641 \u0647\u0646\u0627 \u062F\u0644\u0648\u0642\u062A\u064A"), isPath && /* @__PURE__ */ React.createElement("button", { onClick: onUndo }, "\u062A\u0631\u0627\u062C\u0639")), /* @__PURE__ */ React.createElement("span", { className: "hint" }, isPath ? path.length + " \u0646\u0642\u0637\u0629. \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629 \u0639\u0634\u0627\u0646 \u062A\u0643\u0645\u0644 \u0627\u0644\u0645\u0633\u0627\u0631" : point ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0643\u0627\u0646" + (acc ? " (\u062F\u0642\u0629 " + acc + " \u0645)" : "") : "\u0623\u0648 \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629"), msg && /* @__PURE__ */ React.createElement("p", { className: "msg" }, msg), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: onSave }, "\u062D\u0641\u0638"), /* @__PURE__ */ React.createElement("button", { onClick: onCancel }, "\u0625\u0644\u063A\u0627\u0621")));
}
const EMPTY_DATA = { stops: [], places: [], streets: [], lines: [] };
function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [kind, setKind] = useState(null);
  const [point, setPoint] = useState(null);
  const [path, setPath] = useState([]);
  const [acc, setAcc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState("");
  const isPath = kind === "street" || kind === "line";
  const entering = kind && kind !== "choose";
  const total = data.stops.length + data.places.length + data.streets.length + data.lines.length;
  const load = async () => {
    const [stops, places, streets, lines] = await Promise.all(["stops", "places", "streets", "routes"].map(dbGetAll));
    setData({ stops, places, streets, lines });
  };
  useEffect(() => {
    load();
  }, []);
  const reset = () => {
    setKind(null);
    setPoint(null);
    setPath([]);
    setAcc(null);
    setForm(EMPTY_FORM);
    setMsg("");
  };
  const choose = (k) => {
    setKind(k);
    setMsg("");
  };
  const pick = (p) => {
    if (isPath) setPath((prev) => [...prev, p]);
    else {
      setPoint(p);
      setAcc(null);
    }
  };
  const here = () => {
    setMsg("\u062C\u0627\u0631\u064A \u062A\u062D\u062F\u064A\u062F \u0645\u0643\u0627\u0646\u0643...");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pick([p.coords.latitude, p.coords.longitude]);
        setAcc(isPath ? null : Math.round(p.coords.accuracy));
        setMsg("");
      },
      () => setMsg("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062F \u0645\u0643\u0627\u0646\u0643. \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u062E\u0631\u064A\u0637\u0629."),
      { enableHighAccuracy: true, timeout: 15e3 }
    );
  };
  const save = async () => {
    const err = validateEntry(kind, form, point, path);
    if (err) return setMsg(err);
    await dbPut(KINDS[kind].store, makeEntry(kind, form, point, path, acc));
    await load();
    reset();
  };
  const del = async (store, id) => {
    await dbRemove(store, id);
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
  return /* @__PURE__ */ React.createElement("div", { className: "app" }, /* @__PURE__ */ React.createElement(MapView, { data, draftPoint: point, draftPath: path, picking: entering, onPick: pick, onDraftMove: (p) => {
    setPoint(p);
    setAcc(null);
  }, onDelete: del }), /* @__PURE__ */ React.createElement("div", { className: "bar" }, !kind && /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "primary", onClick: () => setKind("choose") }, "\u0625\u0636\u0627\u0641\u0629"), /* @__PURE__ */ React.createElement("button", { onClick: download }, "\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A (", total, ")")), kind === "choose" && /* @__PURE__ */ React.createElement(KindChooser, { onChoose: choose, onCancel: reset }), entering && /* @__PURE__ */ React.createElement(
    EntryForm,
    {
      kind,
      form,
      setForm,
      point,
      path,
      acc,
      msg,
      onHere: here,
      onUndo: () => setPath((p) => p.slice(0, -1)),
      onSave: save,
      onCancel: reset
    }
  )));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
