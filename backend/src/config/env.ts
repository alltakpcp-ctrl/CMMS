import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  geofenceEnabled: (process.env.GEOFENCE_ENABLED ?? "false") === "true",
  geofenceLat: Number(process.env.GEOFENCE_LAT ?? 0),
  geofenceLng: Number(process.env.GEOFENCE_LNG ?? 0),
  geofenceRadiusM: Number(process.env.GEOFENCE_RADIUS_M ?? 0),
};
