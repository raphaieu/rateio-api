import "dotenv/config";
import { authMiddleware } from "./middleware/auth.js";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import splitsRoute from "./routes/splits.js";
import paymentRoute from "./routes/payment.js";
import publicRoute from "./routes/public.js";
import analyticsExampleRoute from "./routes/analytics-example.js";
import geoRoute from "./routes/geo.js";

const app = new Hono();

app.use("*", logger());
app.use(
    "*",
    cors({
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://rateio.ckao.in",
            "https://rateio-web.vercel.app"
        ],
        allowHeaders: ["Content-Type", "Authorization", "x-signature", "x-request-id", "X-Idempotency-Key"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true
    })
);

app.get("/health", (c) => c.text("ok"));

app.get("/me", authMiddleware, (c) => {
    return c.json({ clerkUserId: c.get("clerkUserId") });
});

app.get("/debug-env", (c) => {
    const vars = [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "CLERK_SECRET_KEY",
        "CLERK_PUBLISHABLE_KEY",
        "MERCADO_PAGO_ACCESS_TOKEN"
    ];

    const result: any = {};
    vars.forEach(v => {
        const val = process.env[v];
        result[v] = {
            exists: !!val,
            length: val ? val.length : 0,
            prefix: val ? val.substring(0, 5) + "..." : "N/A"
        };
    });

    return c.json(result);
});


app.get("/pricing/current", (c) => {
    return c.json({
        baseFeeCents: parseInt(process.env.BASE_FEE_CENTS || "0", 10),
        aiTiers: [
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_1_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_1_CENTS || "0", 10),
            },
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_2_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_2_CENTS || "0", 10),
            },
            {
                maxChars: parseInt(process.env.AI_TEXT_TIER_3_MAX_CHARS || "0", 10),
                cents: parseInt(process.env.AI_TEXT_TIER_3_CENTS || "0", 10),
            },
        ],
    });
});

app.route("/splits", splitsRoute);
app.route("/geo", geoRoute);
app.route("/", paymentRoute);
app.route("/public", publicRoute);
app.route("/analytics", analyticsExampleRoute);

app.get("/debug-db", async (c) => {
    try {
        // Import dynamically to ensure we catch initialization errors here if possible, 
        // though top-level await in db/index.ts might have already thrown.
        // But better to use the shared instance to test the REAL connection.
        const { db } = await import("./db/index.js");
        const { splits } = await import("./db/schema.js");

        const result = await db.select().from(splits).limit(1);

        return c.json({
            status: "ok",
            message: "Database connection successful (Shared Instance)",
            rows_found: result.length,
            url_configured: !!process.env.TURSO_DATABASE_URL
        });
    } catch (e: any) {
        return c.json({
            status: "error",
            message: "Database connection failed",
            error: e.message,
            stack: e.stack,
            env_url_set: !!process.env.TURSO_DATABASE_URL,
            env_token_set: !!process.env.TURSO_AUTH_TOKEN
        }, 500);
    }
});

// Na Vercel não inicia servidor; só exporta o app para o runtime serverless
if (typeof process !== "undefined" && process.env.VERCEL !== "1") {
    const port = Number(process.env.PORT) || 3000;
    console.log(`Server is running on port ${port}`);
    serve({
        fetch: app.fetch,
        port,
    });
}

export default app;
