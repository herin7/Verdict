import assert from "node:assert/strict";
import test from "node:test";

// App composition tests must never read a developer's real DB/auth settings.
// Values set before the dynamic import take precedence over dotenv defaults.
process.env.DATABASE_URL = " ";
process.env.SUPABASE_JWT_ISSUER = " ";

const { buildApp } = await import("../src/app.js");

test("the composed application exposes a health endpoint", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, true);
  } finally {
    await app.close();
  }
});

test("a share without content is rejected before touching storage or the database", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "POST", url: "/shares", payload: { clientId: "client-123456" } });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Share an image, a link or some text/);
  } finally {
    await app.close();
  }
});
