import { getSessionNodes } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

async function getBackendStatus() {
  try {
    const response = await fetch(`${env.backendApiUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return "unhealthy";
    }
    return "ok";
  } catch {
    return "offline";
  }
}

export default async function StatusPage() {
  const backendStatus = await getBackendStatus();
  const dbStatus = await getSessionNodes("__status_probe__")
    .then(() => "ok")
    .catch(() => "offline");

  return (
    <main className="status-page">
      <div className="status-card">
        <p className="page-kicker">System status</p>
        <h1>OpenInfinity services</h1>
        <table className="status-table">
          <tbody>
            <tr>
              <td>Backend</td>
              <td>{backendStatus}</td>
            </tr>
            <tr>
              <td>PostgreSQL</td>
              <td>{dbStatus}</td>
            </tr>
            <tr>
              <td>Image store</td>
              <td>{env.imageStoreDir}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
