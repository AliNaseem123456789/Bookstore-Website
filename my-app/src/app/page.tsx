import { redirect } from "next/navigation";

/** The counter's home is the till. */
export default function Home() {
  redirect("/pos");
}
