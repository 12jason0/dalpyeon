import { OpenLoading } from "./_components/OpenLoading";
import { HomeSkeleton } from "./_components/PageSkeleton";

export default function Loading() {
  return <OpenLoading skeleton={<HomeSkeleton />} />;
}
