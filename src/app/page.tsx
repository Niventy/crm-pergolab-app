import { redirect } from "next/navigation";

// Écran d'accueil = le Kanban (écran principal du quotidien), cohérent avec le
// logo de la barre de navigation.
export default function Home() {
  redirect("/kanban");
}
