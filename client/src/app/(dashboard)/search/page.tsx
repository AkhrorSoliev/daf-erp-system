import { Suspense } from "react";
import { SearchResultsPage } from "@/components/search/search-results-page";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResultsPage />
    </Suspense>
  );
}
