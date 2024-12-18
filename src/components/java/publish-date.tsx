"use client";

export function PublishDate({ date }: { date: Date }) {
  const publicationDate = new Date(date).toLocaleDateString("en-us", {
    day: "numeric",
    weekday: "long",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  return (
    <span
      className="text-sm font-semibold text-gray-700 dark:text-gray-400 dark:shadow-gray-950 dark:text-shadow-around"
      suppressHydrationWarning // Prevents React hydration warning caused by time localisation
    >
      {publicationDate}
    </span>
  );
}
