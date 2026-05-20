import { redirect } from 'next/navigation';

export default function LegacyWeeklyOfferingPage({ params }) {
  redirect(`/offerings/weekly/${params?.voucherDate}`);
}
