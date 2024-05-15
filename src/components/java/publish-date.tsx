"use client";

export function PublishDate({ date }: { date: Date }) {
  const dateFormat: Intl.DateTimeFormatOptions = {
    day: "numeric",
    weekday: "long",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  };
  const publicationDate = new Date(date).toLocaleDateString(
    undefined, // Uses the client's timezone
    dateFormat,
  );

  return (
    <span
      className="text-sm font-semibold text-gray-700 dark:text-gray-500"
      suppressHydrationWarning // Prevents React hydration warning caused by time localisation
    >
      {publicationDate}
    </span>
  );
}
