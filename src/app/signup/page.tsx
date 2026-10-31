import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { AuthForm } from "../_components/AuthForm";
import { Brand } from "../_components/Brand";

export default async function Page() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <Brand />
      <AuthForm mode="signup" />
    </>
  );
}
