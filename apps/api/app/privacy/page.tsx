const contactEmail = "kontakt@gustaroai.com";
const updatedAt = "3. Juli 2026";

const sectionStyle = {
  marginTop: 28
};

export const metadata = {
  title: "Datenschutzerklärung | GustaroAI",
  description: "Datenschutzhinweise für GustaroAI"
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
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>Datenschutzerklärung</h1>
      <p style={{ color: "#667085" }}>Stand: {updatedAt}</p>

      <section style={sectionStyle}>
        <h2>1. Verantwortlicher</h2>
        <p>Verantwortlich für GustaroAI ist:</p>
        <p>
          Mario Scordo – GustaroAI
          <br />
          Einzelunternehmen
          <br />
          [ladungsfähige Anschrift ergänzen]
        </p>
        <p>
          Kontakt für Datenschutz- und Supportanfragen:
          <br />
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>2. Zweck der App</h2>
        <p>GustaroAI ist ein persönlicher KI-gestützter Restaurant-Concierge.</p>
        <p>
          Die App unterstützt Nutzerinnen und Nutzer dabei, auf Basis verfügbarer Restaurant- und
          Speisekarteninformationen, persönlicher Profilangaben und der aktuellen Essenssituation schneller eine
          passende Speisenempfehlung zu erhalten.
        </p>
        <p>
          GustaroAI ist kein Speisekarten-Parser und keine Ernährungsberatung. Die Speisekarte bleibt Informationsquelle
          des Restaurants. Empfehlungen werden von GustaroAI auf Grundlage der verfügbaren Informationen und der
          Nutzerangaben erzeugt.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>3. Verarbeitete Daten</h2>
        <p>
          GustaroAI kann folgende Daten verarbeiten, soweit dies für Betrieb, Sicherheit und Funktion der App
          erforderlich ist:
        </p>
        <ul>
          <li>Account- und Login-Daten, soweit für Anmeldung, Authentifizierung und Sicherheit erforderlich</li>
          <li>Profilangaben wie Vorlieben, Abneigungen, Unverträglichkeiten und gewünschte Ausgabesprache</li>
          <li>vom Nutzer eingegebene Speisekartentexte, Restaurantlinks oder aus QR-Codes gelesene URLs</li>
          <li>Situationsangaben, soweit der Nutzer diese für eine Empfehlung bereitstellt</li>
          <li>Analyseergebnisse und Empfehlungen, die im Rahmen der Nutzung erzeugt werden</li>
          <li>technisches Feedback und Fehlerdaten zur Verbesserung von Stabilität, Sicherheit und Funktion</li>
          <li>Bestätigungen von Sicherheitshinweisen, einschließlich Zeitpunkt, Version und pseudonymisiertem Nutzerbezug</li>
          <li>technische Daten, die für Betrieb, Sicherheit, Missbrauchsschutz und Fehleranalyse erforderlich sind</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>4. Kamera und QR-Codes</h2>
        <p>
          Die Kamera wird ausschließlich verwendet, um QR-Codes von Speisekarten oder Restaurantinformationen zu
          scannen.
        </p>
        <p>GustaroAI speichert keine Kamerabilder und benötigt keinen Mikrofonzugriff.</p>
      </section>

      <section style={sectionStyle}>
        <h2>5. KI-Verarbeitung</h2>
        <p>
          Für die Analyse und Empfehlung können Speisekartentexte, Restaurantlinks, Profilregeln und Situationsangaben
          an serverseitige KI-Dienste übermittelt werden.
        </p>
        <p>
          API-Schlüssel und sicherheitsrelevante Zugangsdaten werden nicht in der mobilen App gespeichert. Die mobile
          App kommuniziert mit dem GustaroAI-Backend.
        </p>
        <p>
          KI-Ergebnisse können fehlerhaft oder unvollständig sein. GustaroAI zeigt Empfehlungen auf Grundlage der
          verfügbaren Informationen an. Bei Allergien, Unverträglichkeiten oder gesundheitlich relevanten Fragen müssen
          Nutzerinnen und Nutzer die Angaben direkt beim Restaurant prüfen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>6. Speicherung und Löschung</h2>
        <p>
          Nutzerinnen und Nutzer können ihren Account und gespeicherte GustaroAI-Daten in der App unter „Profil“
          dauerhaft löschen, sofern diese Funktion in der App bereitgestellt ist.
        </p>
        <p>
          Alternativ kann eine Löschanfrage per E-Mail an{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gestellt werden.
        </p>
        <p>
          Nach einer Löschung werden personenbezogene Daten gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten
          oder berechtigten Sicherheits- und Nachweispflichten entgegenstehen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>7. Weitergabe an Dritte</h2>
        <p>
          Personenbezogene Daten werden nur verarbeitet oder weitergegeben, soweit dies für Betrieb, Authentifizierung,
          Speicherung, Analyse, Sicherheit oder Fehlerbehebung der App erforderlich ist.
        </p>
        <p>Dazu können technische Dienstleister gehören, insbesondere Anbieter für:</p>
        <ul>
          <li>Hosting</li>
          <li>Datenbankbetrieb</li>
          <li>Authentifizierung</li>
          <li>KI-Verarbeitung</li>
          <li>Fehleranalyse</li>
          <li>Sicherheit und Missbrauchsschutz</li>
        </ul>
        <p>Eine Weitergabe zu Werbezwecken erfolgt nicht.</p>
      </section>

      <section style={sectionStyle}>
        <h2>8. Rechte der Nutzerinnen und Nutzer</h2>
        <p>
          Nutzerinnen und Nutzer können im Rahmen der gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen die Verarbeitung ihrer
          personenbezogenen Daten verlangen.
        </p>
        <p>
          Anfragen können an <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gerichtet werden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>9. Sicherheit</h2>
        <p>
          GustaroAI verarbeitet Daten nach dem Grundsatz der Datenminimierung. Es werden nur solche Daten verarbeitet,
          die für die Bereitstellung, Sicherheit und Verbesserung der App erforderlich sind.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>10. Änderungen dieser Datenschutzerklärung</h2>
        <p>
          Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, technische Dienstleister, rechtliche
          Anforderungen oder die Unternehmensstruktur ändern.
        </p>
      </section>
    </main>
  );
}
