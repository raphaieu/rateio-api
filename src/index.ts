import "dotenv/config";
import { authMiddleware } from "./middleware/auth.js";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import splitsRoute from "./routes/splits.js";
import paymentRoute from "./routes/payment.js";
import publicRoute from "./routes/public.js";

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
app.route("/", paymentRoute);
app.route("/public", publicRoute);

app.get("/debug-db", async (c) => {
    try {
        const { createClient } = await import("@libsql/client");
        const { drizzle } = await import("drizzle-orm/libsql");
        const { splits } = await import("./db/schema.js");

        // HARDCODED TEST
        const client = createClient({
            url: "https://rateio-raphaieu.aws-us-east-1.turso.io",
            authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzAwODU4NDUsImlkIjoiZGVkMzRlZTYtYmI2NS00MjcwLTlmZmEtMjAyYTIyNjI1MzllIiwicmlkIjoiYjNhOTMxOTEtMmZjYi00ZjYzLWIwYzctOWViMmZmMDgxMDIzIn0.26lM2KdCgI4fRFyxve2EMXGMqt0saQXmKwMVZPBa35M1keAy44xxd2hdjYYtCZPUYJm0JNUjYaF6bakcm6dvAA"
        });

        const db = drizzle(client);

        const result = await db.select().from(splits).limit(1);

        return c.json({
            status: "ok",
            message: "Database connection successful HARDCODED",
            usersCount: result.length
        });
    } catch (e: any) {
        return c.json({
            status: "error",
            message: "Database connection failed HARDCODED",
            error: e.message,
            stack: e.stack
        }, 500);
    }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port,
});

export default app;
