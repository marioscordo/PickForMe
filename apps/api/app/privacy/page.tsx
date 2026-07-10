import { Fragment, type ReactNode } from "react";

const contactEmail = "info@nuvaisys.com";

const sectionStyle = {
  marginTop: 28
};

type LegalLanguage = "de" | "en";
type PageSearchParams = { lang?: string | string[] };
type LegalPageProps = {
  searchParams?: PageSearchParams | Promise<PageSearchParams>;
};
type LegalSection = {
  title: string;
  body: ReactNode[];
};

const privacyContent: Record<LegalLanguage, {
  lang: string;
  metadata: {
    title: string;
    description: string;
  };
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}> = {
  de: {
    lang: "de",
    metadata: {
      title: "Datenschutzerklärung | GustaroAI",
      description: "Datenschutzhinweise für GustaroAI"
    },
    title: "Datenschutzerklärung",
    updatedAt: "9. Juli 2026",
    sections: [
      {
        title: "1. Verantwortlicher",
        body: [
          <p>Verantwortlich für GustaroAI ist:</p>,
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
          </p>,
          <p>
            Kontakt für Datenschutzanfragen:
            <br />
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>
        ]
      },
      {
        title: "2. Zweck der App",
        body: [
          <p>
            GustaroAI ist ein persönlicher KI-gestützter Restaurant-Concierge. Die App analysiert
            Speisekarteninformationen und erstellt daraus persönliche Speisenempfehlungen auf Grundlage der aktuell
            verfügbaren Speisekarte und freiwilliger Profilangaben.
          </p>,
          <p>
            GustaroAI ist keine medizinische Beratung, keine allergologische Sicherheitsprüfung und keine Garantie für
            vollständige oder fehlerfreie Restaurantangaben.
          </p>
        ]
      },
      {
        title: "3. Account, Login und Account-Löschung",
        body: [
          <p>
            Für Login, Authentifizierung und Accountverwaltung nutzt GustaroAI Supabase Auth. Dabei können insbesondere
            E-Mail-Adresse, Authentifizierungsdaten und technische Sitzungsdaten verarbeitet werden.
          </p>,
          <p>
            Nutzerinnen und Nutzer können ihren Account in der App unter „Profil“ dauerhaft löschen. Dabei werden der
            Supabase-Auth-User sowie gespeicherte GustaroAI-Profildaten, Profilregeln und Empfehlungsfeedback gelöscht,
            soweit keine gesetzlichen Aufbewahrungspflichten oder berechtigten Nachweispflichten entgegenstehen.
          </p>
        ]
      },
      {
        title: "4. Profilangaben",
        body: [
          <p>
            GustaroAI verarbeitet freiwillige Profilangaben, um Empfehlungen zu personalisieren. Dazu gehören
            insbesondere Vorlieben, Ausschlüsse, Unverträglichkeiten, kontrollierte Profileingaben, die gewünschte
            KI-Ausgabesprache sowie Allergene, soweit das Allergenmodul sichtbar oder aktiviert ist.
          </p>,
          <p>
            Profilangaben können lokal in der App und, soweit der Account dies nutzt, serverseitig in Supabase
            gespeichert werden.
          </p>
        ]
      },
      {
        title: "5. Speisekartenanalyse",
        body: [
          <p>
            GustaroAI kann Speisekarteninformationen verarbeiten, die Nutzerinnen und Nutzer eingeben, übernehmen oder
            finden lassen. Dazu gehören Speisekartentexte, Restaurant- und Speisekarten-URLs, PDF- und Website-Inhalte,
            gefundene Restaurantquellen sowie aus QR-Codes oder Weblinks abgeleitete Speisekartenquellen.
          </p>,
          <p>
            Bei der Funktion „Speisekarte fotografieren“ wird ein Foto an das GustaroAI-Backend übermittelt und dort zur
            Texterkennung und Speisekartenanalyse genutzt. Der erkannte Text kann anschließend für die Empfehlung
            verwendet werden. GustaroAI speichert diese Fotos nicht dauerhaft als Testfeedback und legt im Fehlerformular
            keine Fotos oder Base64-Bilddaten ab.
          </p>
        ]
      },
      {
        title: "6. KI-Verarbeitung",
        body: [
          <p>
            Zur Erstellung von Empfehlungen, Speisekartenanalysen, Foto-zu-Text-Erkennung und unterstützenden
            Klassifikationen können Speisekarteninformationen, Restaurantinformationen, Profilangaben und technische
            Kontextdaten an das GustaroAI-Backend und dort eingesetzte KI-Dienste übermittelt werden.
          </p>,
          <p>
            Im aktuellen Produktstand nutzt GustaroAI serverseitig OpenAI. API-Schlüssel und sicherheitsrelevante
            Zugangsdaten werden nicht in der mobilen App gespeichert.
          </p>
        ]
      },
      {
        title: "7. Allergene und Gesundheitshinweis",
        body: [
          <p>
            GustaroAI berücksichtigt Allergene und Unverträglichkeiten nur, soweit sie aus Speisekarteninformationen
            erkennbar sind oder vom Nutzer angegeben wurden. Speisekarten können unvollständig, veraltet oder
            missverständlich sein.
          </p>,
          <p>
            Bei Allergien, Unverträglichkeiten oder gesundheitlich relevanten Fragen müssen Nutzerinnen und Nutzer die
            Angaben immer direkt beim Restaurant prüfen.
          </p>
        ]
      },
      {
        title: "8. Fehlerformular und Testfeedback",
        body: [
          <p>
            Nutzerinnen und Nutzer können in der App Fehler oder Feedback melden. Dabei können Kategorie, Beschreibung,
            Schweregrad, Restaurantname, Stadt, erwartetes Verhalten, Reproduktionsschritte, Kontext der App und eine
            freiwillige Kontaktfreigabe verarbeitet werden.
          </p>,
          <p>
            Zusätzlich speichert GustaroAI technische Angaben wie App-Version, Buildnummer, Plattform, OS-Version,
            Gerätemodell, Sprache/Locale, Zeitpunkt der Meldung und, bei eingeloggten Nutzern, die User-ID. Die
            Meldungen werden zentral in Supabase gespeichert und dienen Fehleranalyse, Qualitätssicherung,
            Testauswertung und Produktverbesserung. Feedbackeinträge können intern mit Status und Admin-Notizen
            bearbeitet werden.
          </p>,
          <p>
            Bitte keine Passwörter, Zahlungsdaten, Gesundheitsdetails oder sonstige sehr persönliche Informationen in das
            Fehlerformular eintragen.
          </p>
        ]
      },
      {
        title: "9. Empfänger und Dienstleister",
        body: [
          <p>
            Personenbezogene Daten werden nur verarbeitet oder weitergegeben, soweit dies für Betrieb, Authentifizierung,
            Speicherung, Analyse, Sicherheit, KI-Verarbeitung oder Fehlerbehebung erforderlich ist.
          </p>,
          <p>Aktuell können insbesondere folgende Dienstleister eingesetzt werden:</p>,
          <ul>
            <li>Supabase für Authentifizierung, Datenbank und serverseitige Speicherung</li>
            <li>Vercel für Hosting und Betrieb der Web-/API-Komponenten</li>
            <li>OpenAI für KI-gestützte Analyse, Klassifikation, Foto-zu-Text und Empfehlungserstellung</li>
          </ul>,
          <p>Eine Weitergabe zu Werbezwecken erfolgt nicht.</p>
        ]
      },
      {
        title: "10. Speicherdauer und Löschung",
        body: [
          <p>
            Profildaten, Profilregeln und Empfehlungsfeedback werden gespeichert, solange der Account besteht oder die
            Daten für die jeweilige Funktion benötigt werden. Support- und Feedbackanfragen werden so lange gespeichert,
            wie dies für Fehleranalyse, Qualitätssicherung, Support, Nachweiszwecke oder Produktverbesserung
            erforderlich ist.
          </p>,
          <p>
            Konkrete Löschfristen können je nach Datenart und rechtlicher Pflicht abweichen. Eine Löschanfrage kann per
            E-Mail an <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gestellt werden.
          </p>
        ]
      },
      {
        title: "11. Rechte der Nutzerinnen und Nutzer",
        body: [
          <p>
            Nutzerinnen und Nutzer können im Rahmen der gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung,
            Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen die Verarbeitung ihrer
            personenbezogenen Daten verlangen.
          </p>,
          <p>
            Außerdem besteht ein Beschwerderecht bei einer zuständigen Datenschutzaufsichtsbehörde. Anfragen können an{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> gerichtet werden.
          </p>
        ]
      },
      {
        title: "12. Sicherheit und Datenminimierung",
        body: [
          <p>
            GustaroAI verarbeitet Daten nach dem Grundsatz der Datenminimierung. Es werden nur solche Daten verarbeitet,
            die für Bereitstellung, Sicherheit, Support, Qualitätssicherung und Verbesserung der App erforderlich sind.
          </p>
        ]
      },
      {
        title: "13. Änderungen dieser Datenschutzerklärung",
        body: [
          <p>
            Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, technische Dienstleister, rechtliche
            Anforderungen oder die Unternehmensstruktur ändern.
          </p>
        ]
      }
    ]
  },
  en: {
    lang: "en",
    metadata: {
      title: "Privacy Policy | GustaroAI",
      description: "Privacy information for GustaroAI"
    },
    title: "Privacy Policy",
    updatedAt: "July 9, 2026",
    sections: [
      {
        title: "1. Controller",
        body: [
          <p>The controller responsible for GustaroAI is:</p>,
          <p>
            NuvAIsys Digital – Mario Scordo
            <br />
            Sole proprietorship
            <br />
            Reuendorfer Weg 8a
            <br />
            91336 Heroldsbach
            <br />
            Germany
          </p>,
          <p>
            Contact for privacy requests:
            <br />
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>
        ]
      },
      {
        title: "2. Purpose of the App",
        body: [
          <p>
            GustaroAI is a personal AI-supported restaurant concierge. The app analyzes menu information and creates
            personal dish recommendations based on the currently available menu and voluntary profile information.
          </p>,
          <p>
            GustaroAI is not medical advice, not an allergy safety check, and not a guarantee that restaurant information
            is complete or error-free.
          </p>
        ]
      },
      {
        title: "3. Account, Login and Account Deletion",
        body: [
          <p>
            GustaroAI uses Supabase Auth for login, authentication, and account management. This may include the
            processing of email address, authentication data, and technical session data.
          </p>,
          <p>
            Users can permanently delete their account in the app under “Profile”. This deletes the Supabase Auth user
            and stored GustaroAI profile data, profile rules, and recommendation feedback, unless statutory retention
            obligations or legitimate documentation obligations prevent deletion.
          </p>
        ]
      },
      {
        title: "4. Profile Information",
        body: [
          <p>
            GustaroAI processes voluntary profile information to personalize recommendations. This includes preferences,
            exclusions, intolerances, controlled profile inputs, the desired AI output language, and allergens where the
            allergen module is visible or enabled.
          </p>,
          <p>
            Profile information may be stored locally in the app and, where the account uses this, server-side in
            Supabase.
          </p>
        ]
      },
      {
        title: "5. Menu Analysis",
        body: [
          <p>
            GustaroAI may process menu information that users enter, adopt, or ask the app to find. This includes menu
            texts, restaurant and menu URLs, PDF and website content, found restaurant sources, and menu sources derived
            from QR codes or web links.
          </p>,
          <p>
            When using the “photograph menu” function, a photo is transmitted to the GustaroAI backend and used there for
            text recognition and menu analysis. The recognized text can then be used for the recommendation. GustaroAI
            does not permanently store these photos as test feedback and does not store photos or Base64 image data in
            the feedback form.
          </p>
        ]
      },
      {
        title: "6. AI Processing",
        body: [
          <p>
            To create recommendations, menu analyses, photo-to-text recognition, and supporting classifications, menu
            information, restaurant information, profile information, and technical context data may be transmitted to
            the GustaroAI backend and the AI services used there.
          </p>,
          <p>
            In the current product state, GustaroAI uses OpenAI on the server side. API keys and security-relevant access
            credentials are not stored in the mobile app.
          </p>
        ]
      },
      {
        title: "7. Allergens and Health Notice",
        body: [
          <p>
            GustaroAI considers allergens and intolerances only to the extent that they are identifiable from menu
            information or have been provided by the user. Menus may be incomplete, outdated, or ambiguous.
          </p>,
          <p>
            In case of allergies, intolerances, or health-related questions, users must always verify the information
            directly with the restaurant.
          </p>
        ]
      },
      {
        title: "8. Error Form and Test Feedback",
        body: [
          <p>
            Users can report errors or feedback in the app. This may include category, description, severity, restaurant
            name, city, expected behavior, reproduction steps, app context, and voluntary contact permission.
          </p>,
          <p>
            In addition, GustaroAI stores technical information such as app version, build number, platform, OS version,
            device model, language/locale, time of report, and, for logged-in users, the user ID. Reports are stored
            centrally in Supabase and are used for error analysis, quality assurance, test evaluation, and product
            improvement. Feedback entries may be processed internally with status and admin notes.
          </p>,
          <p>
            Please do not enter passwords, payment data, health details, or other very personal information in the error
            form.
          </p>
        ]
      },
      {
        title: "9. Recipients and Service Providers",
        body: [
          <p>
            Personal data is processed or disclosed only where this is necessary for operation, authentication, storage,
            analysis, security, AI processing, or troubleshooting.
          </p>,
          <p>The following service providers may currently be used in particular:</p>,
          <ul>
            <li>Supabase for authentication, database, and server-side storage</li>
            <li>Vercel for hosting and operation of the web/API components</li>
            <li>OpenAI for AI-supported analysis, classification, photo-to-text, and recommendation creation</li>
          </ul>,
          <p>Data is not disclosed for advertising purposes.</p>
        ]
      },
      {
        title: "10. Storage Duration and Deletion",
        body: [
          <p>
            Profile data, profile rules, and recommendation feedback are stored for as long as the account exists or the
            data is needed for the respective function. Support and feedback requests are stored for as long as this is
            necessary for error analysis, quality assurance, support, documentation purposes, or product improvement.
          </p>,
          <p>
            Specific deletion periods may vary depending on the type of data and legal obligations. A deletion request
            can be sent by email to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        ]
      },
      {
        title: "11. Rights of Users",
        body: [
          <p>
            Within the statutory requirements, users may request access, rectification, deletion, restriction of
            processing, data portability, and object to the processing of their personal data.
          </p>,
          <p>
            Users also have the right to lodge a complaint with a competent data protection supervisory authority.
            Requests can be sent to <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        ]
      },
      {
        title: "12. Security and Data Minimization",
        body: [
          <p>
            GustaroAI processes data according to the principle of data minimization. Only data required for providing,
            securing, supporting, assuring the quality of, and improving the app is processed.
          </p>
        ]
      },
      {
        title: "13. Changes to this Privacy Policy",
        body: [
          <p>
            This privacy policy may be updated if functions, technical service providers, legal requirements, or the
            company structure change.
          </p>
        ]
      }
    ]
  }
};

function resolveLegalLanguage(value: string | string[] | undefined): LegalLanguage {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw?.toLowerCase().startsWith("en") ? "en" : "de";
}

async function resolveSearchParams(searchParams: LegalPageProps["searchParams"]) {
  return Promise.resolve(searchParams ?? {});
}

export async function generateMetadata({ searchParams }: LegalPageProps) {
  const params = await resolveSearchParams(searchParams);
  const language = resolveLegalLanguage(params.lang);

  return privacyContent[language].metadata;
}

export default async function PrivacyPage({ searchParams }: LegalPageProps) {
  const params = await resolveSearchParams(searchParams);
  const language = resolveLegalLanguage(params.lang);
  const content = privacyContent[language];

  return (
    <main lang={content.lang} style={{
      maxWidth: 840,
      margin: "0 auto",
      padding: "48px 20px 72px",
      lineHeight: 1.6
    }}>
      <p style={{ color: "#667085", margin: "0 0 8px" }}>GustaroAI</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>{content.title}</h1>
      <p style={{ color: "#667085" }}>{language === "de" ? "Stand" : "Updated"}: {content.updatedAt}</p>

      {content.sections.map((section) => (
        <section key={section.title} style={sectionStyle}>
          <h2>{section.title}</h2>
          {section.body.map((item, index) => (
            <Fragment key={index}>{item}</Fragment>
          ))}
        </section>
      ))}
    </main>
  );
}
