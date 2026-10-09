import Link from "next/link";
export default function NotFound() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Entry not found</h1>
      <Link href="/applications" className="mt-4 block text-indigo-500">
        Back to applications →
      </Link>
    </div>
  );
}
