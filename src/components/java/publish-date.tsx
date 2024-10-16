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
      className="dark:text-shadow-around text-sm font-semibold text-gray-700 dark:text-gray-400 dark:shadow-gray-950"
      suppressHydrationWarning // Prevents React hydration warning caused by time localisation
    >
      {publicationDate}
    </span>
  );
}
