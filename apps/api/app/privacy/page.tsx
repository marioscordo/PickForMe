const updatedAt = "3. Juli 2026";

const sectionStyle = {
  marginTop: 28
};

export const metadata = {
  title: "Datenschutzerklaerung | GustaroAI",
  description: "Datenschutzhinweise fuer GustaroAI"
};

export default function PrivacyPage() {
  return (
    <main style={{
      maxWidth: 840,
      margin: "0 auto",
      padding: "48px 20px 72px",
      lineHeight: 1.6
    }}>
      <p style={{ color: "#667085", margin: "0 0 8px" }}>GustaroAI</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>Datenschutzerklaerung</h1>
      <p style={{ color: "#667085" }}>Stand: {updatedAt}</p>

      <section style={sectionStyle}>
        <h2>1. Verantwortlicher</h2>
        <p>
          Verantwortlich fuer GustaroAI ist der Betreiber der App. Kontakt fuer Datenschutz- und Supportanfragen:
          <br />
          <a href="mailto:support@gustaroai.com">support@gustaroai.com</a>
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>2. Zweck der App</h2>
        <p>
          GustaroAI hilft Nutzerinnen und Nutzern, auf Basis einer Speisekarte, ihres Profils und der aktuellen
          Essenssituation eine passende Restaurantempfehlung zu erhalten.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>3. Verarbeitete Daten</h2>
        <p>GustaroAI kann folgende Daten verarbeiten:</p>
        <ul>
          <li>Account- und Login-Daten, soweit fuer Anmeldung und Sicherheit erforderlich</li>
          <li>Profilangaben wie Vorlieben, Abneigungen, Unvertraeglichkeiten und Ausgabesprache</li>
          <li>eingegebene Speisekartentexte, Links oder aus QR-Codes gelesene URLs</li>
          <li>Analyseergebnisse, Empfehlungen und technisches Feedback zur Verbesserung der Funktion</li>
          <li>Bestaetigungen von Sicherheitshinweisen, einschliesslich Zeitpunkt, Version und pseudonymisiertem Nutzerbezug</li>
          <li>technische Daten, die fuer Betrieb, Sicherheit und Fehleranalyse erforderlich sind</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>4. Kamera und QR-Codes</h2>
        <p>
          Die Kamera wird nur verwendet, um QR-Codes von Speisekarten zu scannen. GustaroAI speichert keine
          Kamerabilder und benoetigt keinen Mikrofonzugriff.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>5. KI-Verarbeitung</h2>
        <p>
          Fuer die Analyse koennen Speisekartentexte, Restaurantlinks, Profilregeln und Situationsangaben an
          serverseitige KI-Dienste uebermittelt werden. OpenAI-Schluessel werden nicht in der mobilen App gespeichert.
          Die mobile App kommuniziert mit dem GustaroAI-Backend.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>6. Speicherung und Loeschung</h2>
        <p>
          Nutzerinnen und Nutzer koennen ihren Account und gespeicherte GustaroAI-Daten in der App unter Profil
          dauerhaft loeschen. Alternativ kann eine Loeschanfrage per E-Mail gestellt werden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>7. Weitergabe an Dritte</h2>
        <p>
          Daten werden nur verarbeitet, soweit dies fuer Betrieb, Authentifizierung, Speicherung, Analyse oder
          Sicherheit der App erforderlich ist. Dazu koennen technische Dienstleister wie Hosting-, Datenbank-,
          Authentifizierungs- und KI-Anbieter gehoeren.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>8. Rechte der Nutzerinnen und Nutzer</h2>
        <p>
          Nutzerinnen und Nutzer koennen Auskunft, Berichtigung oder Loeschung ihrer personenbezogenen Daten
          verlangen. Anfragen koennen an <a href="mailto:support@gustaroai.com">support@gustaroai.com</a> gerichtet werden.
        </p>
      </section>
    </main>
  );
}
