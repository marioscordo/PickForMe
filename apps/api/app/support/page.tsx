const contactEmail = "kontakt@gustaroai.com";

const sectionStyle = {
  marginTop: 28
};

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
        Hilfe zu GustaroAI, Datenschutzanfragen und Account-Löschanfragen können per E-Mail gestellt werden:
        <br />
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>

      <section style={sectionStyle}>
        <h2>Hilfe bei Login und Account</h2>
        <p>
          Bei Problemen mit Login, Session, Profil oder Accountverwaltung kannst Du Dich per E-Mail an{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a> wenden.
        </p>
      </section>

      <section style={sectionStyle}>
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

      <section style={sectionStyle}>
        <h2>Fehler in der App melden</h2>
        <p>
          In der App steht unter „Profil“ ein Fehlerformular zur Verfügung. Darüber können Fehler, Testfeedback und
          Hinweise zur Qualität der Empfehlungen direkt an GustaroAI gesendet werden.
        </p>
        <p>Hilfreich sind insbesondere:</p>
        <ul>
          <li>App-Version und Buildnummer</li>
          <li>verwendetes Gerät</li>
          <li>iOS- oder Android-Version</li>
          <li>Restaurant, Stadt und Speisekartenquelle</li>
          <li>kurze Schritte, mit denen der Fehler reproduziert werden kann</li>
          <li>was Du erwartet hättest</li>
        </ul>
        <p>
          Alternativ kannst Du Fehlermeldungen per E-Mail an{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a> senden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Keine sensiblen Daten senden</h2>
        <p>
          Bitte sende keine Passwörter, Zahlungsdaten, Gesundheitsdetails oder sonstige sehr persönliche Informationen
          per Supportnachricht oder Fehlerformular.
        </p>
      </section>
    </main>
  );
}
