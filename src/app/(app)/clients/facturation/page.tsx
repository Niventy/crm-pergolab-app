import { redirect } from "next/navigation";

// Ancien onglet « Facturation » (= acompte reçu) : l'encaissement est devenu un
// filtre du tableau. Redirection pour les liens / favoris existants.
export default function FacturationPage() {
  redirect("/clients/tableau?enc=facturation");
}
