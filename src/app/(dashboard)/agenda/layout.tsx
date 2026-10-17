import { DM_Serif_Display,Manrope } from "next/font/google";
const serif=DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-agenda-serif"
});
const sans=Manrope({
  subsets: ["latin"],
  variable: "--font-agenda-sans"
});
export default function AgendaLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <div className={`${serif.variable} ${sans.variable} min-w-0`} style={{
    fontFamily: "var(--font-agenda-sans)"
  }}>
    {children}
  </div>;
}
