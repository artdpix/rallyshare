import { AdminClient } from './admin-client';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return <AdminClient apiUrl={apiUrl} />;
}
