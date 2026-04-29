import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Job, DriverStatus, LocationPoint, Role } from "../lib/types";

// ... (copy and adapt the logic from the previous App.tsx)
// I will need to make this file robust
export const GHANA_PLACES: LocationPoint[] = [
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
];

export const BASE_FARE = 5;
export const RATE_PER_KM = 2;

export const formatGHS = (n: number) => `₵${n.toFixed(2)}`;

// ... (add the store and simulation logic here)
