const contactEmail = "info@nuvaisys.com";
const updatedAt = "9. Juli 2026";

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
          NuvAIsys Digital – Mario Scordo
          <br />
          Einzelunternehmen
          <br />
          Reuendorfer Weg 8a
          <br />
          91336 Heroldsbach
          <br />
          Deutschland
        </p>
        <p>
          Kontakt für Datenschutzanfragen:
          <br />
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>2. Zweck der App</h2>
        <p>
          GustaroAI ist ein persönlicher KI-gestützter Restaurant-Concierge. Die App analysiert
          Speisekarteninformationen und erstellt daraus persönliche Speisenempfehlungen auf Grundlage der aktuell
          verfügbaren Speisekarte und freiwilliger Profilangaben.
        </p>
        <p>
          GustaroAI ist keine medizinische Beratung, keine allergologische Sicherheitsprüfung und keine Garantie für
          vollständige oder fehlerfreie Restaurantangaben.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>3. Account, Login und Account-Löschung</h2>
        <p>
          Für Login, Authentifizierung und Accountverwaltung nutzt GustaroAI Supabase Auth. Dabei können insbesondere
          E-Mail-Adresse, Authentifizierungsdaten und technische Sitzungsdaten verarbeitet werden.
        </p>
        <p>
          Nutzerinnen und Nutzer können ihren Account in der App unter „Profil“ dauerhaft löschen. Dabei werden der
          Supabase-Auth-User sowie gespeicherte GustaroAI-Profildaten, Profilregeln und Empfehlungsfeedback gelöscht,
          soweit keine gesetzlichen Aufbewahrungspflichten oder berechtigten Nachweispflichten entgegenstehen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>4. Profilangaben</h2>
        <p>
          GustaroAI verarbeitet freiwillige Profilangaben, um Empfehlungen zu personalisieren. Dazu gehören
          insbesondere Vorlieben, Ausschlüsse, Unverträglichkeiten, kontrollierte Profileingaben, die gewünschte
          KI-Ausgabesprache sowie Allergene, soweit das Allergenmodul sichtbar oder aktiviert ist.
        </p>
        <p>
          Profilangaben können lokal in der App und, soweit der Account dies nutzt, serverseitig in Supabase gespeichert
          werden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>5. Speisekartenanalyse</h2>
        <p>
          GustaroAI kann Speisekarteninformationen verarbeiten, die Nutzerinnen und Nutzer eingeben, übernehmen oder
          finden lassen. Dazu gehören Speisekartentexte, Restaurant- und Speisekarten-URLs, PDF- und Website-Inhalte,
          gefundene Restaurantquellen sowie aus QR-Codes oder Weblinks abgeleitete Speisekartenquellen.
        </p>
        <p>
          Bei der Funktion „Speisekarte fotografieren“ wird ein Foto an das GustaroAI-Backend übermittelt und dort zur
          Texterkennung und Speisekartenanalyse genutzt. Der erkannte Text kann anschließend für die Empfehlung
          verwendet werden. GustaroAI speichert diese Fotos nicht dauerhaft als Testfeedback und legt im Fehlerformular
          keine Fotos oder Base64-Bilddaten ab.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>6. KI-Verarbeitung</h2>
        <p>
          Zur Erstellung von Empfehlungen, Speisekartenanalysen, Foto-zu-Text-Erkennung und unterstützenden
          Klassifikationen können Speisekarteninformationen, Restaurantinformationen, Profilangaben und technische
          Kontextdaten an das GustaroAI-Backend und dort eingesetzte KI-Dienste übermittelt werden.
        </p>
        <p>
          Im aktuellen Produktstand nutzt GustaroAI serverseitig OpenAI. API-Schlüssel und sicherheitsrelevante
          Zugangsdaten werden nicht in der mobilen App gespeichert.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>7. Allergene und Gesundheitshinweis</h2>
        <p>
          GustaroAI berücksichtigt Allergene und Unverträglichkeiten nur, soweit sie aus Speisekarteninformationen
          erkennbar sind oder vom Nutzer angegeben wurden. Speisekarten können unvollständig, veraltet oder missverständlich
          sein.
        </p>
        <p>
          Bei Allergien, Unverträglichkeiten oder gesundheitlich relevanten Fragen müssen Nutzerinnen und Nutzer die
          Angaben immer direkt beim Restaurant prüfen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>8. Fehlerformular und Testfeedback</h2>
        <p>
          Nutzerinnen und Nutzer können in der App Fehler oder Feedback melden. Dabei können Kategorie, Beschreibung,
          Schweregrad, Restaurantname, Stadt, erwartetes Verhalten, Reproduktionsschritte, Kontext der App und eine
          freiwillige Kontaktfreigabe verarbeitet werden.
        </p>
        <p>
          Zusätzlich speichert GustaroAI technische Angaben wie App-Version, Buildnummer, Plattform, OS-Version,
          Gerätemodell, Sprache/Locale, Zeitpunkt der Meldung und, bei eingeloggten Nutzern, die User-ID. Die Meldungen
          werden zentral in Supabase gespeichert und dienen Fehleranalyse, Qualitätssicherung, Testauswertung und
          Produktverbesserung. Feedbackeinträge können intern mit Status und Admin-Notizen bearbeitet werden.
        </p>
        <p>
          Bitte keine Passwörter, Zahlungsdaten, Gesundheitsdetails oder sonstige sehr persönliche Informationen in das
          Fehlerformular eintragen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>9. Empfänger und Dienstleister</h2>
        <p>
          Personenbezogene Daten werden nur verarbeitet oder weitergegeben, soweit dies für Betrieb, Authentifizierung,
          Speicherung, Analyse, Sicherheit, KI-Verarbeitung oder Fehlerbehebung erforderlich ist.
        </p>
        <p>Aktuell können insbesondere folgende Dienstleister eingesetzt werden:</p>
        <ul>
          <li>Supabase für Authentifizierung, Datenbank und serverseitige Speicherung</li>
          <li>Vercel für Hosting und Betrieb der Web-/API-Komponenten</li>
          <li>OpenAI für KI-gestützte Analyse, Klassifikation, Foto-zu-Text und Empfehlungserstellung</li>
        </ul>
        <p>Eine Weitergabe zu Werbezwecken erfolgt nicht.</p>
      </section>

      <section style={sectionStyle}>
        <h2>10. Speicherdauer und Löschung</h2>
        <p>
          Profildaten, Profilregeln und Empfehlungsfeedback werden gespeichert, solange der Account besteht oder die
          Daten für die jeweilige Funktion benötigt werden. Support- und Feedbackanfragen werden so lange gespeichert,
          wie dies für Fehleranalyse, Qualitätssicherung, Support, Nachweiszwecke oder Produktverbesserung erforderlich
          ist.
        </p>
        <p>
          Konkrete Löschfristen können je nach Datenart und rechtlicher Pflicht abweichen. Eine Löschanfrage kann per
          E-Mail an <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gestellt werden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>11. Rechte der Nutzerinnen und Nutzer</h2>
        <p>
          Nutzerinnen und Nutzer können im Rahmen der gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen die Verarbeitung ihrer
          personenbezogenen Daten verlangen.
        </p>
        <p>
          Außerdem besteht ein Beschwerderecht bei einer zuständigen Datenschutzaufsichtsbehörde. Anfragen können an{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gerichtet werden.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>12. Sicherheit und Datenminimierung</h2>
        <p>
          GustaroAI verarbeitet Daten nach dem Grundsatz der Datenminimierung. Es werden nur solche Daten verarbeitet,
          die für Bereitstellung, Sicherheit, Support, Qualitätssicherung und Verbesserung der App erforderlich sind.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>13. Änderungen dieser Datenschutzerklärung</h2>
        <p>
          Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, technische Dienstleister, rechtliche
          Anforderungen oder die Unternehmensstruktur ändern.
        </p>
      </section>
    </main>
  );
}
