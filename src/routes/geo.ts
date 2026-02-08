import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono<{ Variables: { clerkUserId: string } }>();

// Auth obrigatório para evitar abuso do proxy
app.use("*", authMiddleware);

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const NOMINATIM_UA =
  process.env.NOMINATIM_USER_AGENT || "rateio-api/1.0 (contact: support@rateio.ckao.in)";

function toNumberOrNull(v: unknown) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NOMINATIM_UA,
        "Accept": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Nominatim error ${res.status}: ${text.slice(0, 200)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------------------------------------------------------
// GET /geo/reverse?lat=&lng=
// -----------------------------------------------------------------------------
app.get(
  "/reverse",
  zValidator(
    "query",
    z.object({
      lat: z.string(),
      lng: z.string(),
    })
  ),
  async (c) => {
    const { lat, lng } = c.req.valid("query");

    const url =
      `${NOMINATIM_BASE_URL}/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}` +
      `&zoom=18&addressdetails=1`;

    const data: any = await fetchJson(url);

    const placeId = data?.place_id != null ? String(data.place_id) : null;
    const displayName = typeof data?.display_name === "string" ? data.display_name : null;
    const nameFromApi = typeof data?.name === "string" ? data.name : null;

    const firstPart = displayName ? displayName.split(",")[0]?.trim() : null;
    const name = nameFromApi || firstPart || displayName || null;

    return c.json({
      provider: "nominatim",
      placeId,
      name,
      displayName,
      latitude: toNumberOrNull(data?.lat),
      longitude: toNumberOrNull(data?.lon),
    });
  }
);

// -----------------------------------------------------------------------------
// GET /geo/search?q=&limit=5
// -----------------------------------------------------------------------------
app.get(
  "/search",
  zValidator(
    "query",
    z.object({
      q: z.string().min(2),
      limit: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
    })
  ),
  async (c) => {
    const { q, limit, lat, lng } = c.req.valid("query");
    const lim = Math.min(10, Math.max(1, Number(limit || "5") || 5));

    const centerLat = toNumberOrNull(lat);
    const centerLng = toNumberOrNull(lng);

    // Se o client enviar coordenadas, usamos viewbox para "puxar" resultados próximos.
    // Não restringimos (bounded=0) — só dá bias. Delta ~ 0.12° (~13km).
    const delta = 0.12;
    const viewbox =
      centerLat != null && centerLng != null
        ? `&viewbox=${encodeURIComponent(
            [
              centerLng - delta,
              centerLat + delta,
              centerLng + delta,
              centerLat - delta,
            ].join(",")
          )}&bounded=0`
        : "";

    const url =
      `${NOMINATIM_BASE_URL}/search?format=jsonv2` +
      `&q=${encodeURIComponent(q)}` +
      `&limit=${encodeURIComponent(String(lim))}` +
      `&addressdetails=1&countrycodes=br${viewbox}`;

    const data: any[] = await fetchJson(url);

    const results = (Array.isArray(data) ? data : []).map((r: any) => {
      const displayName = typeof r?.display_name === "string" ? r.display_name : null;
      const nameFromApi = typeof r?.name === "string" ? r.name : null;
      const firstPart = displayName ? displayName.split(",")[0]?.trim() : null;
      const name = nameFromApi || firstPart || displayName || null;

      const rLat = toNumberOrNull(r?.lat);
      const rLng = toNumberOrNull(r?.lon);
      const distanceKm =
        centerLat != null && centerLng != null && rLat != null && rLng != null
          ? haversineKm(centerLat, centerLng, rLat, rLng)
          : null;

      return {
        provider: "nominatim",
        placeId: r?.place_id != null ? String(r.place_id) : null,
        name,
        displayName,
        latitude: rLat,
        longitude: rLng,
        distanceKm,
      };
    });

    // Se temos coordenadas, ordena por distância (mais perto primeiro)
    if (centerLat != null && centerLng != null) {
      results.sort((a, b) => {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return da - db;
      });
    }

    return c.json({ results });
  }
);

export default app;

