import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { HTTPException } from "hono/http-exception";

type AuthVariables = {
    clerkUserId: string;
};

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        const authHeader = c.req.header("Authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            // Allow passing for public routes, or handle in route?
            // For now, we assume this middleware is applied to protected routes.
            // If we want it global, we might check route path.
            // Better: Apply strictly where needed.
            throw new HTTPException(401, { message: "Missing or invalid token" });
        }

        const token = authHeader.split(" ")[1];

        try {
            const verified = await verifyToken(token, {
                secretKey: process.env.CLERK_SECRET_KEY,
            });

            if (!verified.sub) {
                throw new HTTPException(401, { message: "Invalid token subject" });
            }

            c.set("clerkUserId", verified.sub);
            await next();
        } catch (err: any) {
            console.error("Auth error:", err);
            // DEBUG MODE: Return actual error to client
            // TODO(cleanup): remover stack/hasSecret/keyPrefix do response quando o debug terminar.
            // Ver: docs/MAINTENANCE.md
            return c.json({
                error: "Auth Failed",
                message: err.message || JSON.stringify(err),
                stack: err.stack,
                hasSecret: !!process.env.CLERK_SECRET_KEY,
                keyPrefix: process.env.CLERK_SECRET_KEY ? process.env.CLERK_SECRET_KEY.substring(0, 7) : "NONE"
            }, 401);
        }
    }
);
