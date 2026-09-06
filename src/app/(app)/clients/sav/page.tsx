import { redirect } from "next/navigation";

// Ancien onglet « SAV » (= soldé) : l'encaissement est devenu un filtre du
// tableau ; le vrai SAV est une étape du Kanban clients.
export default function SavPage() {
  redirect("/clients/tableau?enc=sav");
}
