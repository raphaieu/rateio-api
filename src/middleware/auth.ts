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
        } catch (err) {
            console.error("Auth error:", err);
            throw new HTTPException(401, { message: "Unauthorized" });
        }
    }
);
