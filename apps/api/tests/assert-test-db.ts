
import postgres from "postgres";

export async function assertTestDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  const url = new URL(connectionString);

  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/portal_test"
  ) {
    throw new Error(
      "Unsafe test database configuration: expected local portal_test",
    );
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    const rows = await sql`
      SELECT current_database() AS database_name
    `;

    if (rows[0]?.database_name !== "portal_test") {
      throw new Error(
        "Integration tests are not connected to portal_test",
      );
    }
  } finally {
    await sql.end();
  }
}
