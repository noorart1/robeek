
import { redirect } from "next/navigation";

// The dashboard sends signed-out visitors on to /login.
export default function Home() {
  redirect("/dashboard");
}
