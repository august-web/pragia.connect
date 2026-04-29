
export type Role = "customer" | "driver" | "admin";
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
  vehicle?: string;
  rating?: number;
}
export interface LocationPoint {
  name: string;
  lat: number;
  lng: number;
}
export interface Job {
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
export interface DriverStatus {
  driverId: string;
  availability: "online" | "offline";
  currentLocation: LocationPoint;
  lastUpdate: number;
}
