import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Types
type Role = "customer" | "driver" | "admin";
interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
  vehicle?: string;
  rating?: number;
}
interface LocationPoint {
  name: string;
  lat: number;
  lng: number;
}
interface Job {
  id: string;
  customerId: string;
  driverId?: string;
  pickup: LocationPoint;
  destination: LocationPoint;
  distance: number;
  price: number;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled";
  createdAt: number;
  acceptedAt?: number;
  startedAt?: number;
  completedAt?: number;
  paymentStatus?: "unpaid" | "paid";
  paymentMethod?: "mtn" | "vodafone" | "cash";
  notes?: string;
}
interface DriverStatus {
  driverId: string;
  availability: "online" | "offline";
  currentLocation: LocationPoint;
  lastUpdate: number;
}

// Ghana locations
const GHANA_PLACES: LocationPoint[] = [
  { name: "Accra Central", lat: 5.5560, lng: -0.2060 },
  { name: "Kwame Nkrumah Circle", lat: 5.5718, lng: -0.2231 },
  { name: "Kaneshie Market", lat: 5.5686, lng: -0.2340 },
  { name: "Madina Market", lat: 5.6833, lng: -0.1667 },
  { name: "Tema Harbour", lat: 5.6667, lng: -0.0167 },
  { name: "East Legon", lat: 5.6475, lng: -0.1510 },
  { name: "Osu Oxford Street", lat: 5.5560, lng: -0.1780 },
  { name: "Lapaz", lat: 5.5900, lng: -0.2490 },
  { name: "Achimota", lat: 5.6140, lng: -0.2230 },
  { name: "Spintex Road", lat: 5.6300, lng: -0.1050 },
  { name: "Kumasi Kejetia", lat: 6.6916, lng: -1.6244 },
  { name: "Tamale Central", lat: 9.4034, lng: -0.8393 },
];

// Pricing
const BASE_FARE = 5; // GHS
const RATE_PER_KM = 2; // GHS

function haversine(a: LocationPoint, b: LocationPoint) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)) * 10) / 10;
}

function formatGHS(n: number) {
  return `₵${n.toFixed(2)}`;
}

// Storage
const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d }
  },
  set(k: string, v: any) { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new StorageEvent('storage', {key: k})); }
};

// Seed data
function seed() {
  if (!localStorage.getItem("pc_users")) {
    const users: User[] = [
      { id: "u1", name: "Ama Serwaa", email: "customer@demo.com", phone: "0244123456", role: "customer", password: "demo123" },
      { id: "u2", name: "Kwame Asante", email: "driver1@demo.com", phone: "0207123456", role: "driver", password: "demo123", vehicle: "GT-1234-22", rating: 4.8 },
      { id: "u3", name: "Ama Osei", email: "driver2@demo.com", phone: "0556123456", role: "driver", password: "demo123", vehicle: "GT-5678-23", rating: 4.9 },
      { id: "u4", name: "Admin", email: "admin@pragia.com", phone: "0302123456", role: "admin", password: "admin123" },
      { id: "u5", name: "Kofi Mensah", email: "driver3@demo.com", phone: "0249123456", role: "driver", password: "demo123", vehicle: "GT-9012-21", rating: 4.7 },
    ];
    store.set("pc_users", users);
  }
  if (!localStorage.getItem("pc_driverStatus")) {
    const statuses: DriverStatus[] = [
      { driverId: "u2", availability: "offline", currentLocation: GHANA_PLACES[1], lastUpdate: Date.now() },
      { driverId: "u3", availability: "offline", currentLocation: GHANA_PLACES[3], lastUpdate: Date.now() },
      { driverId: "u5", availability: "offline", currentLocation: GHANA_PLACES[0], lastUpdate: Date.now() },
    ];
    store.set("pc_driverStatus", statuses);
  }
  if (!localStorage.getItem("pc_jobs")) {
    const jobs: Job[] = [
      {
        id: "j1", customerId: "u1", driverId: "u2",
        pickup: GHANA_PLACES[0], destination: GHANA_PLACES[6],
        distance: 3.2, price: BASE_FARE + 3.2*RATE_PER_KM,
        status: "completed", createdAt: Date.now()-86400000*2,
        acceptedAt: Date.now()-86400000*2+60000, startedAt: Date.now()-86400000*2+300000, completedAt: Date.now()-86400000*2+1200000,
        paymentStatus: "paid", paymentMethod: "mtn"
      },
      {
        id: "j2", customerId: "u1", driverId: "u3",
        pickup: GHANA_PLACES[5], destination: GHANA_PLACES[2],
        distance: 8.5, price: BASE_FARE + 8.5*RATE_PER_KM,
        status: "completed", createdAt: Date.now()-86400000,
        acceptedAt: Date.now()-86400000+120000, startedAt: Date.now()-86400000+240000, completedAt: Date.now()-86400000+1500000,
        paymentStatus: "paid", paymentMethod: "vodafone"
      },
    ];
    store.set("pc_jobs", jobs);
  }
}
seed();

// Contexts
const AuthContext = createContext<{ user: User | null; login: (e:string,p:string)=>boolean; register: (u:Omit<User,"id">)=>boolean; logout: ()=>void }>({} as any);
const DataContext = createContext<{ users: User[]; jobs: Job[]; driverStatus: DriverStatus[]; updateJob: (j:Job)=>void; addJob: (j:Job)=>void; updateDriverStatus: (d:DriverStatus)=>void; }>( {} as any );

function useAuth() { return useContext(AuthContext) }
function useData() { return useContext(DataContext) }

function DataProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => store.get("pc_users", []));
  const [jobs, setJobs] = useState<Job[]>(() => store.get("pc_jobs", []));
  const [driverStatus, setDriverStatus] = useState<DriverStatus[]>(() => store.get("pc_driverStatus", []));

  useEffect(() => {
    const onStorage = () => {
      setUsers(store.get("pc_users", []));
      setJobs(store.get("pc_jobs", []));
      setDriverStatus(store.get("pc_driverStatus", []));
    };
    window.addEventListener("storage", onStorage);
    const id = setInterval(onStorage, 1000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(id); };
  }, []);

  const updateJob = (job: Job) => {
    const next = jobs.map(j => j.id === job.id ? job : j);
    setJobs(next); store.set("pc_jobs", next);
  };
  const addJob = (job: Job) => {
    const next = [job, ...jobs]; setJobs(next); store.set("pc_jobs", next);
    // simulate matching
    setTimeout(() => simulateMatching(job.id), 2000 + Math.random()*3000);
  };
  const updateDriverStatus = (ds: DriverStatus) => {
    const next = driverStatus.map(d => d.driverId === ds.driverId ? ds : d);
    setDriverStatus(next); store.set("pc_driverStatus", next);
  };

  function simulateMatching(jobId: string) {
    const currentJobs = store.get<Job[]>("pc_jobs", []);
    const job = currentJobs.find(j => j.id === jobId);
    if (!job || job.status !== "pending") return;
    const drivers = store.get<DriverStatus[]>("pc_driverStatus", []).filter(d => d.availability === "online");
    if (drivers.length === 0) {
      // try again later
      setTimeout(() => simulateMatching(jobId), 4000);
      return;
    }
    const chosen = drivers[Math.floor(Math.random()*drivers.length)];
    const updated: Job = { ...job, driverId: chosen.driverId, status: "accepted", acceptedAt: Date.now() };
    const next = currentJobs.map(j => j.id === jobId ? updated : j);
    store.set("pc_jobs", next);
    setJobs(next);
    // auto start
    setTimeout(() => {
      const j2 = store.get<Job[]>("pc_jobs", []).find(j => j.id === jobId);
      if (j2 && j2.status === "accepted") {
        const started = { ...j2, status: "in_progress" as const, startedAt: Date.now() };
        store.set("pc_jobs", store.get<Job[]>("pc_jobs", []).map(j => j.id===jobId?started:j));
      }
    }, 8000);
  }

  return <DataContext.Provider value={{ users, jobs, driverStatus, updateJob, addJob, updateDriverStatus }}>{children}</DataContext.Provider>;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => store.get<User|null>("pc_session", null));
  const { users } = useData();

  const login = (email: string, password: string) => {
    const u = users.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
    if (u) { setUser(u); store.set("pc_session", u); return true; }
    return false;
  };
  const register = (u: Omit<User,"id">) => {
    const exists = users.find(x => x.email.toLowerCase() === u.email.toLowerCase());
    if (exists) return false;
    const nu: User = { ...u, id: "u"+Math.random().toString(36).slice(2,9) };
    const next = [nu, ...users]; store.set("pc_users", next);
    setUser(nu); store.set("pc_session", nu);
    if (u.role === "driver") {
      const ds: DriverStatus[] = store.get("pc_driverStatus", []);
      ds.push({ driverId: nu.id, availability: "offline", currentLocation: GHANA_PLACES[0], lastUpdate: Date.now() });
      store.set("pc_driverStatus", ds);
    }
    return true;
  };
  const logout = () => { setUser(null); store.set("pc_session", null); };
  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

// Helpers
function MapAutoFit({ points }: { points: LocationPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.3));
  }, [points, map]);
  return null;
}

// Landing
function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-green-600 to-emerald-500 grid place-items-center text-white font-black">P</div>
            <span className="font-semibold tracking-tight text-lg">PragiaConnect</span>
            <span className="ml-2 hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Ghana</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#how" className="hover:text-green-700">How it works</a>
            <a href="#pricing" className="hover:text-green-700">Pricing</a>
            <a href="#drivers" className="hover:text-green-700">For Drivers</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={()=>navigate("/login")} className="px-4 py-2 text-sm font-medium">Login</button>
            <button onClick={()=>navigate("/register")} className="px-4 py-2 text-sm font-medium rounded-xl bg-slate-900 text-white hover:bg-black">Sign up</button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs border border-green-200 mb-4">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live in Accra • Kumasi • Tamale
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">
              On-demand pragia logistics for <span className="text-green-700">urban Ghana</span>
            </h1>
            <p className="mt-4 text-slate-600 text-lg max-w-xl">Request a three-wheeled cargo tricycle in minutes. Track in real-time. Pay with MTN MoMo or Vodafone Cash. Built for traders, shops and households.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={()=>navigate("/register")} className="px-6 py-3 rounded-2xl bg-green-600 text-white font-semibold shadow-lg shadow-green-600/20 hover:bg-green-700">Request a Pragia</button>
              <button onClick={()=>navigate("/register")} className="px-6 py-3 rounded-2xl border border-slate-300 font-semibold hover:bg-slate-50">Drive & Earn</button>
            </div>
            <div className="mt-6 flex items-center gap-6 text-sm text-slate-600">
              <div className="flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Verified drivers</div>
              <div className="flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg> Live tracking</div>
              <div className="flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> MoMo & Cash</div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-amber-200/40 via-green-200/40 to-emerald-200/40 blur-3xl rounded-[3rem]" />
            <img src="/images/pragia-hero.jpg" alt="Pragia in Accra" className="relative rounded-[2rem] shadow-2xl w-full object-cover aspect-[4/3]" />
            <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl border border-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Estimated fare</div>
                  <div className="text-2xl font-bold">{formatGHS(BASE_FARE + 5*RATE_PER_KM)} <span className="text-sm font-normal text-slate-500">for 5km</span></div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Base fare</div>
                  <div className="font-semibold">{formatGHS(BASE_FARE)} + {formatGHS(RATE_PER_KM)}/km</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="py-16 bg-slate-50 border-y border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold">How it works</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            {[
              {t:"Request", d:"Enter pickup and drop-off. Get instant price.", i:"M12 5v14M5 12h14"},
              {t:"Match", d:"Nearest online pragia accepts in seconds.", i:"M13 2L3 14h9l-1 8 10-12h-9l1-8z"},
              {t:"Deliver", d:"Track live, pay with MoMo, get receipt.", i:"M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"},
            ].map((s)=>(
              <div key={s.t} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <div className="h-12 w-12 rounded-2xl bg-green-600 text-white grid place-items-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={s.i}/></svg>
                </div>
                <div className="font-semibold text-lg">{s.t}</div>
                <p className="text-slate-600 mt-1">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold">Simple, transparent pricing</h3>
              <p className="mt-3 text-slate-600">No surge, no hidden fees. Perfect for market runs and shop deliveries.</p>
              <div className="mt-6 bg-slate-900 text-white rounded-3xl p-6">
                <div className="text-sm opacity-70">Pricing formula</div>
                <div className="text-3xl font-black mt-1">{formatGHS(BASE_FARE)} + {formatGHS(RATE_PER_KM)} × km</div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  {[3,5,10].map(km=>(
                    <div key={km} className="bg-white/10 rounded-2xl p-3 text-center">
                      <div className="opacity-70">{km} km</div>
                      <div className="text-xl font-bold">{formatGHS(BASE_FARE + km*RATE_PER_KM)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="font-semibold mb-3">Popular routes</div>
              <ul className="space-y3 text-sm">
                {[
                  ["Circle → Kaneshie", 2.8],
                  ["Madina → East Legon", 4.5],
                  ["Accra Central → Osu", 3.2],
                  ["Tema → Spintex", 7.1],
                ].map(([r,km])=>(
                  <li key={r as string} className="flex items-center justify-between py-2 border-b last:border-0 border-dashed border-slate-200">
                    <span>{r}</span>
                    <span className="font-semibold">{formatGHS(BASE_FARE + (km as number)*RATE_PER_KM)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="drivers" className="py-16 bg-green-700 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h3 className="text-3xl font-black">Drive your pragia, earn daily</h3>
            <p className="mt-3 text-green-100">Go online when you want. Accept nearby jobs. Cash out weekly via MoMo.</p>
            <ul className="mt-6 space-y-2 text-green-50">
              <li>• Keep 85% of each fare</li>
              <li>• Instant job alerts</li>
              <li>• In-app navigation</li>
            </ul>
            <button onClick={()=>navigate("/register")} className="mt-6 px-6 py-3 rounded-2xl bg-white text-green-700 font-semibold">Become a driver</button>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20">
            <div className="text-sm opacity-80">This week’s top driver</div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">Ama Osei</div>
                <div className="opacity-80">47 trips • 4.9★</div>
              </div>
              <div className="text-right">
                <div className="text-sm opacity-80">Earnings</div>
                <div className="text-3xl font-black">{formatGHS(847)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div>© {new Date().getFullYear()} PragiaConnect • Built for Ghana</div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-slate-900">Privacy</a>
            <a href="#" className="hover:text-slate-900">Terms</a>
            <a href="#" className="hover:text-slate-900">Support: 0302-123-456</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Auth
function AuthPage({ mode }: { mode: "login"|"register" }) {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name:"", email:"", phone:"", password:"", role:"customer" as Role });
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (mode === "login") {
      if (login(form.email, form.password)) {
        const u = store.get<User[]>("pc_users", []).find(x=>x.email===form.email)!;
        nav(u.role === "customer" ? "/app/customer" : u.role === "driver" ? "/app/driver" : "/app/admin", { replace: true });
      } else setErr("Invalid email or password");
    } else {
      if (!form.name || !form.email || !form.phone || !form.password) { setErr("Fill all fields"); return; }
      const ok = register({ name:form.name, email:form.email, phone:form.phone, role:form.role, password:form.password });
      if (ok) nav(form.role === "customer" ? "/app/customer" : form.role === "driver" ? "/app/driver" : "/app/admin", { replace: true });
      else setErr("Email already registered");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white text-slate-900 grid place-items-center font-black">P</div>
          <span className="font-semibold">PragiaConnect</span>
        </div>
        <div>
          <h1 className="text-4xl font-black leading-tight">Move goods across the city in minutes.</h1>
          <p className="mt-3 text-slate-300 max-w-md">Trusted by traders in Circle, Kaneshie, Madina and Tema.</p>
        </div>
        <div className="text-sm text-slate-400">© PragiaConnect</div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-slate-900 text-white grid place-items-center font-black">P</div>
            <span className="font-semibold">PragiaConnect</span>
          </div>
          <h2 className="text-2xl font-bold">{mode==="login"?"Welcome back":"Create account"}</h2>
          <p className="text-slate-600 mt-1">Demo: customer@demo.com / demo123, driver1@demo.com / demo123, admin@pragia.com / admin123</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode==="register" && (
              <>
                <div>
                  <label className="text-sm">Full name</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
                </div>
                <div>
                  <label className="text-sm">Phone (Ghana)</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" placeholder="0244 123 456" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} />
                </div>
                <div>
                  <label className="text-sm">Role</label>
                  <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white" value={form.role} onChange={e=>setForm({...form, role:e.target.value as Role})}>
                    <option value="customer">Customer - I need deliveries</option>
                    <option value="driver">Driver - I own a pragia</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="text-sm">Email</label>
              <input type="email" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
            </div>
            <div>
              <label className="text-sm">Password</label>
              <input type="password" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} />
            </div>
            {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</div>}
            <button className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-black">{mode==="login"?"Login":"Create account"}</button>
          </form>
          <div className="mt-4 text-sm text-slate-600">
            {mode==="login"?<>New here? <Link to="/register" className="text-green-700 font-medium">Create account</Link></>:<>Have account? <Link to="/login" className="text-green-700 font-medium">Login</Link></>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Protected
function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Customer
function CustomerApp() {
  const { user, logout } = useAuth();
  const { jobs, addJob, updateJob } = useData();
  const nav = useNavigate();
  const [tab, setTab] = useState<"home"|"request"|"history"|"profile">("home");
  const myJobs = useMemo(()=> jobs.filter(j=>j.customerId===user!.id).sort((a,b)=>b.createdAt-a.createdAt), [jobs, user]);
  const activeJob = myJobs.find(j=> ["pending","accepted","in_progress"].includes(j.status));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-600 text-white grid place-items-center font-black">P</div>
            <span className="font-semibold">PragiaConnect</span>
          </div>
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {["home", "request", "history", "profile"].map(t=>(
              <button key={t} onClick={()=>setTab(t as any)} className={`capitalize ${tab===t?"text-green-700":"hover:text-slate-900"}`}>{t}</button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={()=>{logout(); nav("/");}} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">Logout</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:pb-6">
        {tab==="home" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-gradient-to-br from-green-600 to-emerald-600 text-white rounded-3xl p-6 shadow-lg shadow-green-600/20">
                <div className="text-sm opacity-90">Welcome back</div>
                <div className="text-2xl font-bold">{user?.name}</div>
                <button onClick={()=>setTab("request")} className="mt-4 px-5 py-3 rounded-2xl bg-white text-green-700 font-semibold">Request Pragia</button>
              </div>
              {activeJob ? (
                <ActiveJobCard job={activeJob} onPay={(method)=> updateJob({...activeJob, paymentStatus:"paid", paymentMethod: method})} />
              ) : (
                <div className="bg-white rounded-3xl p-6 border border-slate-200">
                  <div className="font-semibold">No active deliveries</div>
                  <p className="text-slate-600 text-sm mt-1">Request a pragia and track it live.</p>
                </div>
              )}
              <div className="bg-white rounded-3xl p-6 border border-slate-200">
                <div className="font-semibold mb-3">Recent trips</div>
                <div className="divide-y divide-slate-100">
                  {myJobs.slice(0,3).map(j=>(
                    <div key={j.id} className="py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{j.pickup.name} → {j.destination.name}</div>
                        <div className="text-xs text-slate-500">{new Date(j.createdAt).toLocaleString()} • {j.distance} km</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatGHS(j.price)}</div>
                        <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${j.status==="completed"?"bg-green-50 text-green-700 border-green-200":"bg-amber-50 text-amber-700 border border-amber-200"}`}>{j.status}</div>
                      </div>
                    </div>
                  ))}
                  {myJobs.length===0 && <div className="text-sm text-slate-500">No trips yet.</div>}
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-200">
                <div className="font-semibold">Pricing</div>
                <div className="mt-2 text-3xl font-black">{formatGHS(BASE_FARE)} <span className="text-base font-medium text-slate-500">+ {formatGHS(RATE_PER_KM)}/km</span></div>
                <p className="text-sm text-slate-600 mt-1">Pay with MTN MoMo or Vodafone Cash on delivery.</p>
              </div>
              <div className="bg-white rounded-3xl p-6 border border-slate-200">
                <div className="font-semibold">Tips</div>
                <ul className="mt2 text-sm text-slate-600 list-disc pl-5 space-y-1">
                  <li>Pack items securely for pragia transport</li>
                  <li>Be ready at pickup to avoid waiting fees</li>
                  <li>Rate your driver after each trip</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab==="request" && <RequestForm onCreated={(j)=>{ addJob(j); setTab("home"); }} />}

        {tab==="history" && (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 font-semibold">Trip history</div>
            <div className="divide-y divide-slate-100">
              {myJobs.map(j=>(
                <div key={j.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{j.pickup.name} → {j.destination.name}</div>
                    <div className="text-xs text-slate-500">{new Date(j.createdAt).toLocaleDateString()} • {j.distance} km • {j.driverId ? "Driver assigned" : "No driver"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatGHS(j.price)}</div>
                    <div className="text-xs">{j.paymentStatus==="paid" ? `Paid • ${j.paymentMethod?.toUpperCase()}` : "Unpaid"}</div>
                  </div>
                </div>
              ))}
              {myJobs.length===0 && <div className="p-6 text-sm text-slate-500">No history yet.</div>}
            </div>
          </div>
        )}

        {tab==="profile" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-xl">
            <div className="font-semibold text-lg">Profile</div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-slate-500">Name</div><div className="font-medium">{user?.name}</div></div>
              <div><div className="text-slate-500">Phone</div><div className="font-medium">{user?.phone}</div></div>
              <div><div className="text-slate-500">Email</div><div className="font-medium">{user?.email}</div></div>
              <div><div className="text-slate-500">Role</div><div className="font-medium capitalize">{user?.role}</div></div>
            </div>
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
        <div className="grid grid-cols-4">
          {[
            {k:"home", l:"Home", i:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"},
            {k:"request", l:"Request", i:"M12 4v16m8-8H4"},
            {k:"history", l:"History", i:"M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"},
            {k:"profile", l:"Profile", i:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"},
          ].map(b=>(
            <button key={b.k} onClick={()=>setTab(b.k as any)} className={`py-3 flex flex-col items-center gap-1 text-xs ${tab===b.k?"text-green-700":"text-slate-500"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={b.i} strokeLinecap="round" strokeLinejoin="round"/></svg>
              {b.l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ActiveJobCard({ job, onPay }: { job: Job; onPay: (m:"mtn"|"vodafone")=>void }) {
  const { users, updateJob } = useData();
  const driver = users.find(u=>u.id===job.driverId);
  const [showPay, setShowPay] = useState(false);
  const steps = ["pending","accepted","in_progress","completed"] as const;
  const idx = steps.indexOf(job.status as any);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">Active delivery</div>
            <div className="text-xl font-bold">{job.pickup.name} → {job.destination.name}</div>
            <div className="text-sm text-slate-600 mt-1">{job.distance} km • {formatGHS(job.price)}</div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium border ${job.status==="pending"?"bg-amber-50 text-amber-700 border-amber-200":job.status==="completed"?"bg-green-50 text-green-700 border-green-200":"bg-blue-50 text-blue-700 border-blue-200"}`}>{job.status.replace("_"," ")}</div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {steps.map((s,i)=>(
            <div key={s} className="flex flex-col items-center">
              <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold border ${i<=idx?"bg-green-600 text-white border-green-600":"bg-slate-100 text-slate-500 border-slate-200"}`}>{i+1}</div>
              <div className="text-[11px] mt-1 capitalize">{s.replace("_"," ")}</div>
            </div>
          ))}
        </div>

        {driver && (
          <div className="mt-4 flex items-center justify-between bg-slate-50 rounded-2xl p-3 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white grid place-items-center font-bold">{driver.name.split(" ").map(n=>n[0]).join("")}</div>
              <div>
                <div className="font-medium leading-tight">{driver.name}</div>
                <div className="text-xs text-slate-600">{driver.vehicle} • {driver.rating}★</div>
              </div>
            </div>
            <a href={`tel:${driver.phone}`} className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-sm">Call</a>
          </div>
        )}

        <div className="mt-4 h-56 rounded-2xl overflow-hidden border border-slate-200">
          <MapContainer center={[job.pickup.lat, job.pickup.lng] as any} zoom={13} style={{height:"100%", width:"100%"}} zoomControl={false} attributionControl={false as any}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[job.pickup.lat, job.pickup.lng]} />
            <Marker position={[job.destination.lat, job.destination.lng]} />
            <Polyline positions={[[job.pickup.lat, job.pickup.lng],[job.destination.lat, job.destination.lng]]} />
            <MapAutoFit points={[job.pickup, job.destination]} />
          </MapContainer>
        </div>

        <div className="mt-4 flex gap-2">
          {job.status !== "completed" && job.status !== "cancelled" && (
            <button onClick={()=>updateJob({...job, status:"cancelled"})} className="px-4 py-2 rounded-xl border border-slate-300">Cancel</button>
          )}
          {job.status === "in_progress" && (
            <button onClick={()=>{ updateJob({...job, status:"completed", completedAt: Date.now()}); setShowPay(true); }} className="px-4 py-2 rounded-xl bg-green-600 text-white font-medium">Mark Delivered</button>
          )}
          {job.status === "completed" && job.paymentStatus !== "paid" && (
            <button onClick={()=>setShowPay(true)} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-medium">Pay {formatGHS(job.price)}</button>
          )}
        </div>
      </div>
      {showPay && (
        <PayModal amount={job.price} onClose={()=>setShowPay(false)} onPaid={onPay} />
      )}
    </div>
  );
}

function PayModal({ amount, onClose, onPaid }: { amount:number; onClose:()=>void; onPaid:(m:"mtn"|"vodafone")=>void }) {
  const [method, setMethod] = useState<"mtn"|"vodafone">("mtn");
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const pay = () => {
    setLoading(true);
    setTimeout(()=>{ setLoading(false); onPaid(method); onClose(); }, 1500);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold">Pay with Mobile Money</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <div className="mt-1 text-slate-600 text-sm">Powered by Paystack</div>
        <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200">
          <div className="text-xs text-slate-500">Amount</div>
          <div className="text-3xl font-black">{formatGHS(amount)}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            {k:"mtn", l:"MTN MoMo", c:"bg-yellow-400"},
            {k:"vodafone", l:"Vodafone Cash", c:"bg-red-600"},
          ].map(o=>(
            <button key={o.k} onClick={()=>setMethod(o.k as any)} className={`p-3 rounded-2xl border text-left ${method===o.k?"border-slate-900 ring-2 ring-slate-900/10":"border-slate-200"}`}>
              <div className={`h-6 w-6 rounded-lg ${o.c} mb-2`} />
              <div className="font-medium">{o.l}</div>
              <div className="text-xs text-slate-500">Instant</div>
            </button>
          ))}
        </div>
        <label className="block mt-4 text-sm">MoMo number</label>
        <input value={number} onChange={e=>setNumber(e.target.value)} placeholder="0244 123 456" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" />
        <button disabled={loading || number.length<9} onClick={pay} className="mt-4 w-full py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">
          {loading ? "Processing..." : `Pay ${formatGHS(amount)}`}
        </button>
        <div className="mt-3 text-[11px] text-slate-500 text-center">Demo mode – no real charge</div>
      </div>
    </div>
  );
}

function RequestForm({ onCreated }: { onCreated:(j:Job)=>void }) {
  const { user } = useAuth();
  const [pickup, setPickup] = useState<LocationPoint>(GHANA_PLACES[0]);
  const [dest, setDest] = useState<LocationPoint>(GHANA_PLACES[6]);
  const [pq, setPq] = useState(""); const [dq, setDq] = useState("");
  const [notes, setNotes] = useState("");
  const distance = useMemo(()=> haversine(pickup, dest), [pickup, dest]);
  const price = useMemo(()=> BASE_FARE + distance*RATE_PER_KM, [distance]);

  const submit = () => {
    const job: Job = {
      id: "j"+Math.random().toString(36).slice(2,9),
      customerId: user!.id,
      pickup, destination: dest,
      distance, price: Math.round(price*100)/100,
      status: "pending", createdAt: Date.now(),
      notes, paymentStatus: "unpaid"
    };
    onCreated(job);
  };

  const PlaceInput = ({ value, query, setQuery, onSelect, label }: any) => {
    const [open, setOpen] = useState(false);
    const filtered = GHANA_PLACES.filter(p=> p.name.toLowerCase().includes(query.toLowerCase()));
    return (
      <div className="relative">
        <label className="text-sm text-slate-600">{label}</label>
        <input value={open?query:value.name} onFocus={()=>{setOpen(true); setQuery("");}} onChange={e=>setQuery(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" placeholder="Search place in Accra..." />
        {open && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-auto">
            {filtered.map(p=>(
              <button key={p.name} onClick={()=>{onSelect(p); setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50">{p.name}</button>
            ))}
            {filtered.length===0 && <div className="px-3 py-2 text-sm text-slate-500">No matches</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 p-6">
        <div className="font-semibold text-lg">Request a Pragia</div>
        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <PlaceInput label="Pickup" value={pickup} query={pq} setQuery={setPq} onSelect={setPickup} />
          <PlaceInput label="Destination" value={dest} query={dq} setQuery={setDq} onSelect={setDest} />
        </div>
        <label className="block mt-4 text-sm text-slate-600">Notes for driver (optional)</label>
        <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. 3 boxes of tomatoes, call on arrival" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600" />
        <div className="mt-4 h-64 rounded-2xl overflow-hidden border border-slate-200">
          <MapContainer center={[5.56, -0.20] as any} zoom={12} style={{height:"100%",width:"100%"}} zoomControl={false} attributionControl={false as any}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[pickup.lat, pickup.lng]} />
            <Marker position={[dest.lat, dest.lng]} />
            <Polyline positions={[[pickup.lat, pickup.lng],[dest.lat, dest.lng]]} />
            <MapAutoFit points={[pickup, dest]} />
          </MapContainer>
        </div>
      </div>
      <div className="lg:col-span-2">
        <div className="bg-slate-900 text-white rounded-3xl p-6 sticky top-20">
          <div className="text-sm opacity-80">Fare estimate</div>
          <div className="text-4xl font-black mt-1">{formatGHS(price)}</div>
          <div className="mt-1 opacity-80">{distance} km • {formatGHS(BASE_FARE)} base + {formatGHS(RATE_PER_KM)}/km</div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/10 rounded-2xl p-3"><div className="opacity-70">Pickup</div><div className="font-medium">{pickup.name}</div></div>
            <div className="bg-white/10 rounded-2xl p-3"><div className="opacity-70">Drop-off</div><div className="font-medium">{dest.name}</div></div>
          </div>
          <button onClick={submit} className="mt-5 w-full py-3 rounded-2xl bg-white text-slate-900 font-semibold">Confirm & Request</button>
          <div className="mt-2 text-xs opacity-70 text-center">You'll be matched in ~10 seconds</div>
        </div>
      </div>
    </div>
  );
}

// Driver
function DriverApp() {
  const { user, logout } = useAuth();
  const { jobs, driverStatus, updateDriverStatus, updateJob } = useData();
  const nav = useNavigate();
  const [tab, setTab] = useState<"home"|"jobs"|"earnings"|"profile">("home");
  const myStatus = driverStatus.find(d=>d.driverId===user!.id)!;
  const incoming = jobs.filter(j=> j.status==="pending");
  const myActive = jobs.find(j=> j.driverId===user!.id && ["accepted","in_progress"].includes(j.status));
  const myJobs = jobs.filter(j=> j.driverId===user!.id);

  const toggle = () => {
    updateDriverStatus({ ...myStatus, availability: myStatus.availability==="online"?"offline":"online", lastUpdate: Date.now() });
  };

  const accept = (job: Job) => {
    updateJob({ ...job, driverId: user!.id, status: "accepted", acceptedAt: Date.now() });
    setTimeout(()=> updateJob({ ...job, driverId: user!.id, status: "in_progress", startedAt: Date.now() }), 3000);
  };

  const earningsToday = myJobs.filter(j=> j.status==="completed" && j.completedAt && Date.now()-j.completedAt < 86400000).reduce((s,j)=>s+j.price*0.85,0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center font-black">P</div>
            <span className="font-semibold">Driver</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggle} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${myStatus.availability==="online"?"bg-green-600 text-white border-green-600":"bg-white border-slate-300"}`}>
              {myStatus.availability==="online"?"Online":"Offline"}
            </button>
            <button onClick={()=>{logout(); nav("/");}} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Logout</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:pb-6">
        {tab==="home" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500">Today's earnings (85%)</div>
                    <div className="text-3xl font-black">{formatGHS(earningsToday)}</div>
                  </div>
                  <div className={`h-12 w-28 rounded-2xl border-2 flex items-center p-1 cursor-pointer ${myStatus.availability==="online"?"bg-green-50 border-green-500":"bg-slate-100 border-slate-300"}`} onClick={toggle}>
                    <div className={`h-10 w-10 rounded-xl bg-white shadow grid place-items-center transition-all ${myStatus.availability==="online"?"translate-x-16":""}`}>
                      <div className={`h-3 w-3 rounded-full ${myStatus.availability==="online"?"bg-green-600":"bg-slate-400"}`} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-600">Go online to receive job requests near {myStatus.currentLocation.name}.</div>
              </div>

              {myActive ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-6">
                  <div className="font-semibold">Active job</div>
                  <div className="mt-2 text-lg font-bold">{myActive.pickup.name} → {myActive.destination.name}</div>
                  <div className="text-sm text-slate-600">{myActive.distance} km • {formatGHS(myActive.price)}</div>
                  <div className="mt-3 h-56 rounded-2xl overflow-hidden border">
                    <MapContainer center={[myActive.pickup.lat, myActive.pickup.lng] as any} zoom={13} style={{height:"100%",width:"100%"}} zoomControl={false} attributionControl={false as any}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[myActive.pickup.lat, myActive.pickup.lng]} />
                      <Marker position={[myActive.destination.lat, myActive.destination.lng]} />
                      <Polyline positions={[[myActive.pickup.lat,myActive.pickup.lng],[myActive.destination.lat,myActive.destination.lng]]} />
                    </MapContainer>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a target="_blank" href={`https://www.google.com/maps/dir/${myActive.pickup.lat},${myActive.pickup.lng}/${myActive.destination.lat},${myActive.destination.lng}`} className="px-4 py-2 rounded-xl bg-slate-900 text-white">Navigate</a>
                    {myActive.status==="accepted" && <button onClick={()=>updateJob({...myActive, status:"in_progress", startedAt:Date.now()})} className="px-4 py-2 rounded-xl border">Start trip</button>}
                    {myActive.status==="in_progress" && <button onClick={()=>updateJob({...myActive, status:"completed", completedAt:Date.now(), paymentStatus:"unpaid"})} className="px-4 py-2 rounded-xl bg-green-600 text-white">Complete</button>}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200 p-6">
                  <div className="font-semibold">No active job</div>
                  <p className="text-sm text-slate-600">When you're online, new requests will appear here.</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 p-6">
                <div className="font-semibold">Incoming requests</div>
                <div className="mt-3 space-y-3">
                  {myStatus.availability==="offline" && <div className="text-sm text-slate-500">Go online to receive jobs.</div>}
                  {myStatus.availability==="online" && incoming.slice(0,3).map(j=>(
                    <div key={j.id} className="border border-slate-200 rounded-2xl p-3">
                      <div className="font-medium">{j.pickup.name} → {j.destination.name}</div>
                      <div className="text-xs text-slate-600">{j.distance} km • {formatGHS(j.price)}</div>
                      <div className="mt-2 flex gap-2">
                        <button onClick={()=>accept(j)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm">Accept</button>
                        <button className="px-3 py-1.5 rounded-lg border text-sm">Decline</button>
                      </div>
                    </div>
                  ))}
                  {myStatus.availability==="online" && incoming.length===0 && <div className="text-sm text-slate-500">No requests right now.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="jobs" && (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b font-semibold">My trips</div>
            <div className="divide-y">
              {myJobs.map(j=>(
                <div key={j.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{j.pickup.name} → {j.destination.name}</div>
                    <div className="text-xs text-slate-500">{new Date(j.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatGHS(j.price*0.85)}</div>
                    <div className="text-xs">{j.status}</div>
                  </div>
                </div>
              ))}
              {myJobs.length===0 && <div className="p-6 text-sm text-slate-500">No trips yet.</div>}
            </div>
          </div>
        )}

        {tab==="earnings" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6">
              <div className="font-semibold">Earnings overview</div>
              <div className="mt-4 grid grid-cols-7 gap-2 items-end h-40">
                {[120, 80, 150, 90, 200, 170, earningsToday||60].map((v,i)=>(
                  <div key={i} className="bg-green-600/80 rounded-t-lg" style={{height: `${Math.max(10, v/2)}%`}} title={`Day ${i+1}`} />
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">Last 7 days (85% share)</div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 p-6">
              <div className="font-semibold">Payouts</div>
              <div className="mt-2 text-3xl font-black">{formatGHS(myJobs.reduce((s,j)=>s+(j.status==="completed"?j.price*0.85:0),0))}</div>
              <div className="text-sm text-slate-600">Total earned</div>
              <button className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 text-white">Request payout to MoMo</button>
            </div>
          </div>
        )}

        {tab==="profile" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-xl">
            <div className="font-semibold text-lg">Driver profile</div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-slate-500">Name</div><div className="font-medium">{user?.name}</div></div>
              <div><div className="text-slate-500">Phone</div><div className="font-medium">{user?.phone}</div></div>
              <div><div className="text-slate-500">Vehicle</div><div className="font-medium">{user?.vehicle || "—"}</div></div>
              <div><div className="text-slate-500">Rating</div><div className="font-medium">{user?.rating || 5}★</div></div>
            </div>
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t">
        <div className="grid grid-cols-4">
          {[
            {k:"home",l:"Home",i:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"},
            {k:"jobs",l:"Jobs",i:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"},
            {k:"earnings",l:"Earnings",i:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"},
            {k:"profile",l:"Profile",i:"M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"},
          ].map(b=>(
            <button key={b.k} onClick={()=>setTab(b.k as any)} className={`py-3 flex flex-col items-center gap-1 text-xs ${tab===b.k?"text-slate-900":"text-slate-500"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={b.i} strokeLinecap="round" strokeLinejoin="round"/></svg>
              {b.l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Admin
function AdminApp() {
  const { user, logout } = useAuth();
  const { users, jobs, driverStatus } = useData();
  const nav = useNavigate();
  const totalRevenue = jobs.filter(j=>j.status==="completed").reduce((s,j)=>s+j.price,0);
  const activeDrivers = driverStatus.filter(d=>d.availability==="online").length;
  const pendingJobs = jobs.filter(j=>j.status==="pending").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center font-black">P</div>
            <span className="font-semibold">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:block">{user?.email}</span>
            <button onClick={()=>{logout(); nav("/");}} className="text-sm px-3 py-1.5 rounded-lg border">Logout</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {l:"Total jobs", v:jobs.length},
            {l:"Revenue", v:formatGHS(totalRevenue)},
            {l:"Active drivers", v:activeDrivers},
            {l:"Pending", v:pendingJobs},
          ].map(c=>(
            <div key={c.l} className="bg-white rounded-3xl border border-slate-200 p-5">
              <div className="text-sm text-slate-500">{c.l}</div>
              <div className="text-2xl font-black mt-1">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b font-semibold">Live jobs</div>
            <div className="divide-y max-h-[420px] overflow-auto">
              {jobs.slice(0,20).map(j=>(
                <div key={j.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{j.pickup.name} → {j.destination.name}</div>
                    <div className="text-xs text-slate-500">{new Date(j.createdAt).toLocaleTimeString()} • {j.distance} km</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatGHS(j.price)}</div>
                    <div className={`text-[11px] px-2 py-0.5 rounded-full border inline-block ${j.status==="completed"?"bg-green-50 text-green-700 border-green-200":j.status==="pending"?"bg-amber-50 text-amber-700 border-amber-200":"bg-blue-50 text-blue-700 border-blue-200"}`}>{j.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b font-semibold">Users</div>
            <div className="divide-y max-h-[420px] overflow-auto">
              {users.map(u=>(
                <div key={u.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email} • {u.phone}</div>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${u.role==="driver"?"bg-blue-50 text-blue-700 border-blue-200":u.role==="admin"?"bg-slate-900 text-white border-slate-900":"bg-slate-50 text-slate-700 border-slate-200"}`}>{u.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// App root
export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/app/customer" element={<RequireAuth roles={["customer"]}><CustomerApp /></RequireAuth>} />
            <Route path="/app/driver" element={<RequireAuth roles={["driver"]}><DriverApp /></RequireAuth>} />
            <Route path="/app/admin" element={<RequireAuth roles={["admin"]}><AdminApp /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </DataProvider>
    </BrowserRouter>
  );
}