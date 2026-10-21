import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Initialised lazily so builds don't fail when the credentials aren't present.
function adminApp(): App {
  return (
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    })
  );
}

export function adminDb() {
  return getFirestore(adminApp());
}

// Firebase ID tokens are verified with jose directly rather than firebase-admin/auth,
// whose jwks-rsa dependency fails to load jose (ESM-only) on Vercel.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// Returns the uid from the request's Firebase ID token, or null if missing/invalid.
export async function getRequestUid(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
