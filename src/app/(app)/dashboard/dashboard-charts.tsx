"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const BRAND = "#2f6b4f"; // vert forêt
const LIME = "#a3cd3e";

function euros(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

// Histogramme mensuel générique (€ ou nombre). Le mois sélectionné est surligné.
export function BarParMois({
  data,
  moisActif,
  unite,
  libelle,
}: {
  data: { mois: string; valeur: number }[];
  moisActif: number | null;
  unite: "euro" | "nombre";
  libelle: string;
}) {
  const fmt = (v: number) => (unite === "euro" ? euros(v) : `${v}`);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="mois"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="#9ca3af"
        />
        <YAxis
          tickFormatter={(v) =>
            unite === "euro" ? `${Math.round(v / 1000)}k` : `${v}`
          }
          tickLine={false}
          axisLine={false}
          width={32}
          fontSize={11}
          stroke="#9ca3af"
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(0,0,0,0.04)" }}
          formatter={(v) => [fmt(Number(v)), libelle]}
          labelStyle={{ fontWeight: 600 }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="valeur" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === moisActif ? LIME : BRAND} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
