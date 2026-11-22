// hansport Logo als Komponente – funktioniert mit Preact und React.
// <HansportLogo />                              Zeichen + Schriftzug, folgt der Textfarbe
// <HansportLogo variant="mark" size={22} />     nur das Zeichen
// <HansportLogo variant="icon" size={96} animated />  App-Icon mit Verlauf, Striche zeichnen sich ein
import { h } from "preact";
import { hansportSvg } from "./hansport-logo.js";

export default function HansportLogo({ variant = "lockup", size = 28, color, title = "hansport", animated = false, style, ...rest }) {
  const html = hansportSvg({ variant, size, color: color || "currentColor", title, animated });
  return <span {...rest} style={{ display: "inline-flex", lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
}
