import { EventsClient } from './events-client';

export const dynamic = 'force-dynamic';

export default function AdminEventsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return <EventsClient apiUrl={apiUrl} />;
}
