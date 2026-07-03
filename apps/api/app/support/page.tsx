const contactEmail = "kontakt@gustaroai.com";

export const metadata = {
  title: "Support | GustaroAI",
  description: "Support und Account-Löschung für GustaroAI"
};

export default function SupportPage() {
  return (
    <main style={{
      maxWidth: 760,
      margin: "0 auto",
      padding: "48px 20px 72px",
      lineHeight: 1.6
    }}>
      <p style={{ color: "#667085", margin: "0 0 8px" }}>GustaroAI</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>Support</h1>
      <p>
        Hilfe, Datenschutzanfragen und Account-Löschanfragen können per E-Mail gestellt werden:
        <br />
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>

      <section style={{ marginTop: 28 }}>
        <h2>Account und Daten löschen</h2>
        <p>
          In der App kann der Account unter „Profil“ dauerhaft gelöscht werden. Dabei werden der Account und die
          gespeicherten GustaroAI-Daten entfernt, soweit keine gesetzlichen Aufbewahrungspflichten oder berechtigten
          Sicherheits- und Nachweispflichten entgegenstehen.
        </p>
        <p>
          Falls der Zugriff auf die App nicht möglich ist, kann die Löschung per E-Mail an{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a> angefragt werden.
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Fehler melden</h2>
        <p>Bitte beschreibe das Problem möglichst genau. Hilfreich sind insbesondere:</p>
        <ul>
          <li>verwendetes Gerät</li>
          <li>Betriebssystem</li>
          <li>App-Version</li>
          <li>Restaurant oder Speisekarte, bei der der Fehler aufgetreten ist</li>
          <li>Schritte, mit denen der Fehler reproduziert werden kann</li>
          <li>optional ein Screenshot, sofern keine sensiblen Daten sichtbar sind</li>
        </ul>
        <p>
          GustaroAI prüft Fehlermeldungen, um Stabilität, Sicherheit und Nutzererlebnis der App zu verbessern.
        </p>
      </section>
    </main>
  );
}
